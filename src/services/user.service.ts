import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { FastifyInstance } from 'fastify';
import validator from 'validator';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  walletAddress?: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  password?: string;
  walletAddress?: string;
}

export interface UpdateProfileInput {
  username?: string;
  avatarUrl?: string;
}

interface UserProfileResponse {
  id: string;
  username: string;
  email: string;
  walletAddress: string | null;
  avatarUrl: string | null;
  language: string;
  elo: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ResetCodeEntry {
  code: string;
  expires: number;
}

export class UserService {
  private jwtSecret: string;
  private transporter: nodemailer.Transporter;
  private resetCodes: Map<string, ResetCodeEntry>;
  private logger: FastifyInstance['log'];
  private googleClient: OAuth2Client;

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
    this.googleClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:8080/users/google-callback'
    );
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

  private generateToken(id: string, username: string, googleAuth: boolean): string {
    if (!validator.isUUID(id)) {
      this.logger.error(`Invalid UUID for token generation: ${id}`);
      throw new Error('Internal error: invalid user ID');
    }
    return jwt.sign({ id, username, googleAuth }, this.jwtSecret, { expiresIn: '1h', noTimestamp: true });
  }

  async createUser(data: CreateUserInput) {
    const cleanUsername = this.validateUsername(data.username);
    const cleanEmail = this.validateEmail(data.email);
    const cleanPassword = this.validatePassword(data.password);

    const existingUser = await prisma.users.findFirst({
      where: {
        username: {
          equals: cleanUsername,
          mode: 'insensitive',
        },
      },
    });
    if (existingUser) {
      this.logger.info(`Duplicate username attempt: ${data.username} (normalized: ${cleanUsername})`);
      throw new Error('This username is already taken (case-insensitive). Please choose a different username.');
    }

    const emailCheck = await prisma.users.findFirst({
      where: { email: cleanEmail },
    });
    if (emailCheck) throw new Error('This email is already registered. Please use a different email.');

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const user = await prisma.users.create({
      data: {
        id: crypto.randomUUID(),
        username: cleanUsername,
        email: cleanEmail,
        hashedPassword,
        walletAddress: data.walletAddress,
        googleAuth: false,
      },
    });

    const { hashedPassword: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserById(id: string) {
    const user = await prisma.users.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            games: true,
            ownedNFTs: true,
          },
        },
      },
    });

    if (!user) return null;

    const { hashedPassword: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserByEmail(email: string) {
    const cleanEmail = this.validateEmail(email);
    const user = await prisma.users.findUnique({
      where: { email: cleanEmail },
      include: {
        _count: {
          select: {
            games: true,
            ownedNFTs: true,
          },
        },
      },
    });

    if (!user) return null;

    const { hashedPassword: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getAllUsers(limit: number = 10, offset: number = 0) {
    const users = await prisma.users.findMany({
      skip: offset,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const total = await prisma.users.count();

    const usersWithoutPasswords = users.map((user) => {
      const { hashedPassword: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    return {
      users: usersWithoutPasswords,
      total,
      limit,
      offset,
    };
  }

  async updateUser(id: string, data: UpdateUserInput) {
    const updateData: any = {};

    if (data.username) updateData.username = this.validateUsername(data.username);
    if (data.email) updateData.email = this.validateEmail(data.email);
    if (data.password) updateData.hashedPassword = await bcrypt.hash(this.validatePassword(data.password), 10);
    if (data.walletAddress !== undefined) updateData.walletAddress = data.walletAddress;

    try {
      const updatedUser = await prisma.users.update({
        where: { id },
        data: updateData,
      });

      const { hashedPassword: _, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword;
    } catch (error) {
      return null;
    }
  }

  async updateProfile(id: string, data: UpdateProfileInput) {
    const updateData: any = {};

    if (data.username) {
      const cleanUsername = this.validateUsername(data.username);
      const existingUser = await prisma.users.findFirst({
        where: {
          username: { equals: cleanUsername, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existingUser) throw new Error('Username already taken');
      updateData.username = cleanUsername;
    }

    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl || null;

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid updates provided');
    }

    try {
      const updatedUser = await prisma.users.update({
        where: { id },
        data: updateData,
      });

      const { hashedPassword: _, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword;
    } catch (error) {
      return null;
    }
  }

  async deleteUser(id: string) {
    try {
      await prisma.users.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      return false;
    }
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

    const user = await prisma.users.findFirst({
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
    if (user.googleAuth) {
      this.logger.warn(`Attempted password login for Google-authenticated user: ${cleanIdentifier}`);
      throw new Error('This account uses Google login. Please use Google to sign in.');
    }
    const isMatch = await bcrypt.compare(cleanPassword, user.hashedPassword);
    if (!isMatch) {
      this.logger.warn(`Failed login attempt for ${cleanIdentifier}`);
      throw new Error('Invalid password');
    }
    const token = this.generateToken(user.id, user.username, user.googleAuth);
    return {
      token,
      data: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        walletAddress: user.walletAddress, 
        avatarUrl: user.avatarUrl, 
        language: user.language,
        elo: user.elo, 
        createdAt: user.createdAt,
        updatedAt: user.updatedAt 
      },
    };
  }

  async verifyToken(token: string): Promise<{ id: string; username: string; googleAuth: boolean }> {
    if (!token || typeof token !== 'string' || !validator.isLength(token, { max: 1024 })) {
      this.logger.warn(`Invalid token format: ${token ? token.length : 'empty'}`);
      throw new Error('Token must be a non-empty string (max 1024 chars)');
    }
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { id: string; username: string; googleAuth: boolean; exp?: number };
      if (!decoded.id || !decoded.username) throw new Error('Invalid token payload');
      const user = await prisma.users.findUnique({ where: { id: decoded.id } });
      if (!user || user.username !== decoded.username || user.googleAuth !== decoded.googleAuth) {
        throw new Error('User not found or token mismatch');
      }
      return { id: decoded.id, username: decoded.username, googleAuth: decoded.googleAuth };
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const cleanEmail = this.validateEmail(email);
    const user = await prisma.users.findUnique({ where: { email: cleanEmail } });
    if (!user) throw new Error('Email not found');
    if (user.googleAuth) {
      this.logger.warn(`Password reset attempt for Google-authenticated user: ${cleanEmail}`);
      throw new Error('This account uses Google login. Use Google’s account recovery to reset your password at myaccount.google.com/security.');
    }

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
    } catch (error: any) {
      this.logger.error(`Failed to send verification code to ${cleanEmail}: ${error.message}`);
      throw new Error(`Failed to send verification code: ${error.message}`);
    }
  }

  async verifyResetCode(email: string, resetCode: string): Promise<void> {
    const cleanEmail = this.validateEmail(email);
    const cleanResetCode = this.validateResetCode(resetCode);

    const user = await prisma.users.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      this.logger.warn(`Email not found for reset code verification: ${cleanEmail}`);
      throw new Error('Email not found');
    }
    if (user.googleAuth) {
      this.logger.warn(`Reset code verification attempt for Google-authenticated user: ${cleanEmail}`);
      throw new Error('This account uses Google login. Use Google’s account recovery to reset your password at myaccount.google.com/security.');
    }

    const storedReset = this.resetCodes.get(cleanEmail);
    if (!storedReset || storedReset.code !== cleanResetCode) {
      this.logger.warn(`Invalid reset code attempt for ${cleanEmail}: ${cleanResetCode}`);
      throw new Error('Invalid verification code');
    }
    if (Date.now() > storedReset.expires) {
      this.logger.warn(`Expired reset code attempt for ${cleanEmail}`);
      throw new Error('Verification code expired');
    }
  }

  async resetPassword(email: string, resetCode: string, newPassword: string): Promise<{ token: string }> {
    const cleanEmail = this.validateEmail(email);
    const cleanResetCode = this.validateResetCode(resetCode);
    const cleanNewPassword = this.validatePassword(newPassword);

    const user = await prisma.users.findUnique({ where: { email: cleanEmail } });
    if (!user) throw new Error('Email not found');
    if (user.googleAuth) {
      this.logger.warn(`Password reset attempt for Google-authenticated user: ${cleanEmail}`);
      throw new Error('This account uses Google login. Use Google’s account recovery to reset your password at myaccount.google.com/security.');
    }

    const storedReset = this.resetCodes.get(cleanEmail);
    if (!storedReset || storedReset.code !== cleanResetCode) {
      this.logger.warn(`Invalid reset code attempt for ${cleanEmail}: ${cleanResetCode}`);
      throw new Error('Invalid verification code');
    }
    if (Date.now() > storedReset.expires) throw new Error('Verification code expired');

    const isSamePassword = await bcrypt.compare(cleanNewPassword, user.hashedPassword);
    if (isSamePassword) throw new Error('New password cannot be the same as the current password');

    const hashedPassword = await bcrypt.hash(cleanNewPassword, 10);
    await prisma.users.update({
      where: { email: cleanEmail },
      data: { hashedPassword },
    });

    this.resetCodes.delete(cleanEmail);

    const newToken = this.generateToken(user.id, user.username, user.googleAuth);
    return { token: newToken };
  }

  async updatePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    if (!validator.isUUID(userId)) {
      this.logger.error(`Invalid user ID: ${userId}`);
      throw new Error('Invalid user ID');
    }
    const cleanOldPassword = this.validatePassword(oldPassword);
    const cleanNewPassword = this.validatePassword(newPassword);

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`User not found: ${userId}`);
      throw new Error('User not found');
    }
    if (user.googleAuth) {
      this.logger.warn(`Password update attempt for Google-authenticated user: ${userId}`);
      throw new Error('This account uses Google login. Password changes are managed through your Google account at myaccount.google.com/security.');
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
    await prisma.users.update({
      where: { id: userId },
      data: { hashedPassword },
    });
  }

  async googleAuth(state: string): Promise<string> {
    const authUrl = this.googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      state,
    });
    return authUrl;
  }

  async googleCallback(code: string, state: string): Promise<{ email: string; tempToken: string } | { token: string; data: UserProfileResponse }> {
    try {
      this.logger.info(`Received Google callback with code: ${code}, state: ${state}`);
      const { tokens } = await this.googleClient.getToken(code);
      this.googleClient.setCredentials(tokens);

      const ticket = await this.googleClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        this.logger.warn('Invalid Google ID token payload');
        throw new Error('Invalid Google ID token');
      }

      this.logger.info(`Google ID token verified for email: ${payload.email}`);
      const email = this.validateEmail(payload.email);

      const existingUser = await prisma.users.findUnique({ where: { email } });
      if (existingUser) {
        if (!existingUser.googleAuth) {
          this.logger.warn(`Google login attempt for non-Google registered email: ${email}`);
          throw new Error('This email has been used already for a standard account. Please use a different Google account or sign in with your password.');
        }
        this.logger.info(`Existing Google user found: ${email}`);
        const token = this.generateToken(existingUser.id, existingUser.username, existingUser.googleAuth);
        return {
          token,
          data: {
            id: existingUser.id,
            username: existingUser.username,
            email: existingUser.email,
            walletAddress: existingUser.walletAddress,
            avatarUrl: existingUser.avatarUrl,
            language: existingUser.language,
            elo: existingUser.elo,
            createdAt: existingUser.createdAt,
            updatedAt: existingUser.updatedAt,
          },
        };
      }

      const tempToken = jwt.sign({ email }, this.jwtSecret, { expiresIn: '10m' });
      return { email, tempToken };
    } catch (error: any) {
      this.logger.error(`Google callback error: ${error.message}, stack: ${error.stack}`);
      throw new Error(error.message || 'Failed to authenticate with Google');
    }
  }

  async completeGoogleLogin(tempToken: string, username: string): Promise<{ token: string; data: UserProfileResponse }> {
    try {
      const decoded = jwt.verify(tempToken, this.jwtSecret) as { email: string };
      const email = this.validateEmail(decoded.email);
      const cleanUsername = this.validateUsername(username);

      const existingUser = await prisma.users.findUnique({ where: { email } });
      if (existingUser) {
        this.logger.info(`Email already registered during Google login completion: ${email}`);
        throw new Error('This email has been used already for a standard account. Please use a different Google account.');
      }

      const existingUsername = await prisma.users.findFirst({
        where: { username: { equals: cleanUsername, mode: 'insensitive' } },
      });
      if (existingUsername) {
        this.logger.warn(`Duplicate username attempt during Google login: ${cleanUsername}`);
        throw new Error('Username already taken');
      }

      const randomPassword = Math.random().toString(36).slice(-12);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      const user = await prisma.users.create({
        data: {
          id: crypto.randomUUID(),
          username: cleanUsername,
          email,
          hashedPassword,
          googleAuth: true,
        },
      });

      this.logger.info(`Created new user from Google login: ${email}, username: ${cleanUsername}`);
      const token = this.generateToken(user.id, user.username, user.googleAuth);
      return {
        token,
        data: { 
          id: user.id, 
          username: user.username, 
          email: user.email, 
          walletAddress: user.walletAddress, 
          avatarUrl: user.avatarUrl,
          language: user.language,
          elo: user.elo, 
          createdAt: user.createdAt,
          updatedAt: user.updatedAt 
        },
      };
    } catch (error: any) {
      this.logger.error(`Google login completion error: ${error.message}, stack: ${error.stack}`);
      throw new Error(error.message || 'Failed to complete Google login');
    }
  }

  async checkAuthType(email: string): Promise<{ googleAuth: boolean }> {
    const cleanEmail = this.validateEmail(email);
    const user = await prisma.users.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      this.logger.warn(`Email not found for auth type check: ${cleanEmail}`);
      throw new Error('Email not found');
    }
    return { googleAuth: user.googleAuth };
  }
}