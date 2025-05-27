import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import validator from 'validator';
import { postgresPrisma } from '../configs/prismaClient';

interface UserProfileResponse {
  id: string;
  username: string;
  email: string;
  walletAddress: string | null;
  elo: number;
  createdAt: Date;
}

interface ResetCodeEntry {
  code: string;
  expires: number;
}

class UsersService {
  private jwtSecret: string;
  private transporter: nodemailer.Transporter;
  private resetCodes: Map<string, ResetCodeEntry>;
  private logger: FastifyInstance['log'];

  constructor(fastify: FastifyInstance) {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.resetCodes = new Map();
    this.logger = fastify.log;
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password',
      },
    });
  }

  private validateUsername(username: string): string {
    if (!username || typeof username !== 'string') {
      this.logger.warn(`Invalid username type: ${typeof username}`);
      throw new Error('Username must be a non-empty string');
    }
    const trimmed = validator.trim(username);
    if (!validator.isLength(trimmed, { min: 3, max: 50 })) {
      this.logger.warn(`Username length violation: ${trimmed.length} chars`);
      throw new Error('Username must be between 3 and 50 characters');
    }
    if (!validator.isAlphanumeric(trimmed)) {
      this.logger.warn(`Non-alphanumeric username attempt: ${trimmed}`);
      throw new Error('Username must contain only letters and numbers');
    }
    return trimmed.toLowerCase();
  }

  private validateEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      this.logger.warn(`Invalid email type: ${typeof email}`);
      throw new Error('Email must be a non-empty string');
    }
    const trimmed = validator.trim(email);
    if (!validator.isLength(trimmed, { max: 255 })) {
      this.logger.warn(`Email exceeds max length: ${trimmed.length}`);
      throw new Error('Email must not exceed 255 characters');
    }
    if (!validator.isEmail(trimmed) || !trimmed.endsWith('@gmail.com')) {
      this.logger.warn(`Invalid email format attempt: ${trimmed}`);
      throw new Error('Email must be a valid Gmail address (e.g., user@gmail.com)');
    }
    const validEmailRegex = /^[a-zA-Z0-9@.]+$/;
    if (!validEmailRegex.test(trimmed)) {
      this.logger.warn(`Email contains invalid special characters: ${trimmed}`);
      throw new Error('Email can only contain letters, numbers, @, and .');
    }
    const normalized = validator.normalizeEmail(trimmed, { gmail_lowercase: true }) as string;
    return validator.escape(normalized);
  }

  private validatePassword(password: string): string {
    if (!password || typeof password !== 'string') {
      this.logger.warn(`Invalid password type: ${typeof password}`);
      throw new Error('Password must be a non-empty string');
    }
    const trimmed = validator.trim(password);
    if (!validator.isLength(trimmed, { min: 9, max: 128 })) {
      this.logger.warn(`Password length violation: ${trimmed.length} chars`);
      throw new Error('Password must be between 9 and 128 characters');
    }
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{9,}$/;
    if (!passwordRegex.test(trimmed)) {
      this.logger.warn(`Weak password attempt: ${trimmed.length} chars`);
      throw new Error('Password must be at least 9 characters, with 1 uppercase, 1 number, and 1 special character (!@#$%^&*)');
    }
    return trimmed;
  }

  private validateResetCode(resetCode: string): string {
    if (!resetCode || typeof resetCode !== 'string') {
      this.logger.warn(`Invalid reset code type: ${typeof resetCode}`);
      throw new Error('Reset code must be a non-empty string');
    }
    const trimmed = validator.trim(resetCode);
    if (!validator.isNumeric(trimmed) || trimmed.length !== 6) {
      this.logger.warn(`Invalid reset code format: ${trimmed}`);
      throw new Error('Reset code must be a 6-digit number');
    }
    return trimmed;
  }

  private generateToken(id: string, username: string): string {
    if (!validator.isUUID(id)) {
      this.logger.error(`Invalid UUID for token generation: ${id}`);
      throw new Error('Internal error: invalid user ID');
    }
    return jwt.sign({ id, username }, this.jwtSecret, { expiresIn: '1h', noTimestamp: true });
  }

  async register(username: string, password: string, email: string): Promise<{ token: string; data: UserProfileResponse }> {
    const cleanUsername = this.validateUsername(username);
    const cleanEmail = this.validateEmail(email);
    const cleanPassword = this.validatePassword(password);

    const existingUser = await postgresPrisma.users.findFirst({
      where: {
        username: {
          equals: cleanUsername,
          mode: 'insensitive',
        },
      },
    });
    if (existingUser) {
      this.logger.info(`Duplicate username attempt: ${username} (normalized: ${cleanUsername})`);
      throw new Error('This username is already taken (case-insensitive). Please choose a different username.');
    }

    const emailCheck = await postgresPrisma.users.findFirst({
      where: { email: cleanEmail },
    });
    if (emailCheck) throw new Error('This email is already registered. Please use a different email.');

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const user = await postgresPrisma.users.create({
      data: {
        username: cleanUsername,
        hashedPassword,
        email: cleanEmail,
      },
    });
    const token = this.generateToken(user.id, user.username);
    return {
      token,
      data: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress, elo: user.elo, createdAt: user.createdAt },
    };
  }

  async login(identifier: string, password: string): Promise<{ token: string; data: UserProfileResponse }> {
    if (!identifier || typeof identifier !== 'string') {
      this.logger.warn(`Invalid identifier type: ${typeof identifier}`);
      throw new Error('Username or email must be a non-empty string');
    }
    const cleanPassword = this.validatePassword(password);

    let cleanIdentifier: string;
    let isEmail = validator.isEmail(identifier);
    if (isEmail) {
      cleanIdentifier = this.validateEmail(identifier);
    } else {
      cleanIdentifier = this.validateUsername(identifier);
    }

    const user = await postgresPrisma.users.findFirst({
      where: {
        OR: [
          { username: { equals: cleanIdentifier, mode: 'insensitive' } },
          { email: cleanIdentifier },
        ],
      },
    });
    if (!user) {
      this.logger.warn(`Login attempt for non-existent user/email: ${cleanIdentifier}`);
      throw new Error('User or email not found');
    }
    const isMatch = await bcrypt.compare(cleanPassword, user.hashedPassword);
    if (!isMatch) {
      this.logger.warn(`Failed login attempt for ${cleanIdentifier}`);
      throw new Error('Invalid password');
    }
    const token = this.generateToken(user.id, user.username);
    return {
      token,
      data: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress, elo: user.elo, createdAt: user.createdAt },
    };
  }

  async verifyToken(token: string): Promise<{ id: string; username: string }> {
    if (!token || typeof token !== 'string' || !validator.isLength(token, { max: 1024 })) {
      this.logger.warn(`Invalid token format: ${token ? token.length : 'empty'}`);
      throw new Error('Token must be a non-empty string (max 1024 chars)');
    }
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { id: string; username: string; exp?: number };
      if (!decoded.id || !decoded.username) throw new Error('Invalid token payload');
      const user = await postgresPrisma.users.findUnique({ where: { id: decoded.id } });
      if (!user || user.username !== decoded.username) throw new Error('User not found or token mismatch');
      return { id: decoded.id, username: decoded.username };
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async getUser(username: string): Promise<UserProfileResponse> {
    const cleanUsername = this.validateUsername(username);
    const user = await postgresPrisma.users.findFirst({
      where: {
        username: {
          equals: cleanUsername,
          mode: 'insensitive',
        },
      },
    });
    if (!user) throw new Error('User not found');
    return { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress, elo: user.elo, createdAt: user.createdAt };
  }

  async getUserByEmail(email: string): Promise<UserProfileResponse> {
    const cleanEmail = this.validateEmail(email);
    const user = await postgresPrisma.users.findUnique({
      where: { email: cleanEmail },
    });
    if (!user) throw new Error('User not found');
    return { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress, elo: user.elo, createdAt: user.createdAt };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const cleanEmail = this.validateEmail(email);
    const user = await postgresPrisma.users.findUnique({ where: { email: cleanEmail } });
    if (!user) throw new Error('Email not found');

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetCodeExpires = Date.now() + 15 * 60 * 1000;

    this.resetCodes.set(cleanEmail, { code: resetCode, expires: resetCodeExpires });

    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: cleanEmail,
      subject: 'Password Reset Verification Code',
      text: `Your verification code is: ${resetCode}. It expires in 15 minutes.`,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.info(`Verification code sent to ${cleanEmail}`);
    } catch (error) {
      console.log(`Fallback: Verification code for ${cleanEmail}: ${resetCode}`);
    }
  }

  async resetPassword(email: string, resetCode: string, newPassword: string): Promise<{ token: string }> {
    const cleanEmail = this.validateEmail(email);
    const cleanResetCode = this.validateResetCode(resetCode);
    const cleanNewPassword = this.validatePassword(newPassword);

    const user = await postgresPrisma.users.findUnique({ where: { email: cleanEmail } });
    if (!user) throw new Error('Email not found');

    const storedReset = this.resetCodes.get(cleanEmail);
    if (!storedReset || storedReset.code !== cleanResetCode) {
      this.logger.warn(`Invalid reset code attempt for ${cleanEmail}: ${cleanResetCode}`);
      throw new Error('Invalid verification code');
    }
    if (Date.now() > storedReset.expires) throw new Error('Verification code expired');

    const isSamePassword = await bcrypt.compare(cleanNewPassword, user.hashedPassword);
    if (isSamePassword) throw new Error('New password cannot be the same as the current password');

    const hashedPassword = await bcrypt.hash(cleanNewPassword, 10);
    await postgresPrisma.users.update({
      where: { email: cleanEmail },
      data: { hashedPassword },
    });

    this.resetCodes.delete(cleanEmail);

    const newToken = this.generateToken(user.id, user.username);
    return { token: newToken };
  }

  async updatePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    if (!validator.isUUID(userId)) {
      this.logger.error(`Invalid user ID: ${userId}`);
      throw new Error('Invalid user ID');
    }
    const cleanOldPassword = this.validatePassword(oldPassword);
    const cleanNewPassword = this.validatePassword(newPassword);

    const user = await postgresPrisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`User not found: ${userId}`);
      throw new Error('User not found');
    }

    const isMatch = await bcrypt.compare(cleanOldPassword, user.hashedPassword);
    if (!isMatch) {
      this.logger.warn(`Invalid old password for user: ${userId}`);
      throw new Error('Invalid old password');
    }

    const isSamePassword = await bcrypt.compare(cleanNewPassword, user.hashedPassword);
    if (isSamePassword) {
      throw new Error('New password cannot be the same as the current password');
    }

    const hashedPassword = await bcrypt.hash(cleanNewPassword, 10);
    await postgresPrisma.users.update({
      where: { id: userId },
      data: { hashedPassword },
    });
  }

  async updateProfile(
    userId: string,
    updates: { username?: string; email?: string; walletAddress?: string; avatar?: string }
  ): Promise<void> {
    if (!validator.isUUID(userId)) {
      this.logger.error(`Invalid user ID: ${userId}`);
      throw new Error('Invalid user ID');
    }

    const user = await postgresPrisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`User not found: ${userId}`);
      throw new Error('User not found');
    }

    const data: any = {};

    if (updates.username && updates.username !== user.username) {
      const cleanUsername = this.validateUsername(updates.username);
      const existingUser = await postgresPrisma.users.findFirst({
        where: {
          username: { equals: cleanUsername, mode: 'insensitive' },
          id: { not: userId },
        },
      });
      if (existingUser) {
        throw new Error('Username already taken');
      }
      data.username = cleanUsername;
    }

    if (updates.email && updates.email !== user.email) {
      const cleanEmail = this.validateEmail(updates.email);
      const existingEmail = await postgresPrisma.users.findFirst({
        where: { email: cleanEmail, id: { not: userId } },
      });
      if (existingEmail) {
        throw new Error('Email already registered');
      }
      data.email = cleanEmail;
    }

    if (updates.walletAddress !== undefined) {
      data.walletAddress = updates.walletAddress || null;
    }

    if (updates.avatar) {
      if (!validator.isURL(updates.avatar)) {
        throw new Error('Avatar must be a valid URL');
      }
      data.avatar = updates.avatar;
    }

    if (Object.keys(data).length === 0) {
      throw new Error('No valid updates provided');
    }

    await postgresPrisma.users.update({
      where: { id: userId },
      data,
    });
  }
}

export default UsersService;