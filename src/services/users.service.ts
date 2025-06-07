import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import validator from 'validator';
import { postgresPrisma } from '../configs/prismaClient';
import { OAuth2Client } from 'google-auth-library';

interface UserProfileResponse {
  id: string;
  username: string;
  email: string;
  walletAddress: string | null;
  elo: number;
  avatarUrl: string | null;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ResetCodeEntry {
  code: string;
  expires: number;
}

const DEFAULT_AVATAR_URL = 'https://source.unsplash.com/random/200x200?avatar';

class UsersService {
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
        googleAuth: false,
        language: 'en',
        avatarUrl: DEFAULT_AVATAR_URL,
      },
    });
    const token = this.generateToken(user.id, user.username, user.googleAuth);
    return {
      token,
      data: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        walletAddress: user.walletAddress, 
        elo: user.elo, 
        avatarUrl: user.avatarUrl,
        language: user.language,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
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
        elo: user.elo, 
        avatarUrl: user.avatarUrl,
        language: user.language,
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
      const user = await postgresPrisma.users.findUnique({ where: { id: decoded.id } });
      if (!user || user.username !== decoded.username || user.googleAuth !== decoded.googleAuth) {
        throw new Error('User not found or token mismatch');
      }
      return { id: decoded.id, username: decoded.username, googleAuth: decoded.googleAuth };
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
    return { 
      id: user.id, 
      username: user.username, 
      email: user.email, 
      walletAddress: user.walletAddress, 
      elo: user.elo, 
      avatarUrl: user.avatarUrl,
      language: user.language,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  async getUserByEmail(email: string): Promise<UserProfileResponse> {
    const cleanEmail = this.validateEmail(email);
    const user = await postgresPrisma.users.findUnique({
      where: { email: cleanEmail },
    });
    if (!user) throw new Error('User not found');
    return { 
      id: user.id, 
      username: user.username, 
      email: user.email, 
      walletAddress: user.walletAddress, 
      elo: user.elo, 
      avatarUrl: user.avatarUrl,
      language: user.language,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const cleanEmail = this.validateEmail(email);
    const user = await postgresPrisma.users.findUnique({ where: { email: cleanEmail } });
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

    const user = await postgresPrisma.users.findUnique({ where: { email: cleanEmail } });
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

    const user = await postgresPrisma.users.findUnique({ where: { email: cleanEmail } });
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
    await postgresPrisma.users.update({
      where: { email: cleanEmail },
      data: { hashedPassword, updatedAt: new Date() },
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

    const user = await postgresPrisma.users.findUnique({ where: { id: userId } });
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
    await postgresPrisma.users.update({
      where: { id: userId },
      data: { hashedPassword, updatedAt: new Date() },
    });
  }

  async updateProfile(
    userId: string,
    updates: { username?: string; avatarUrl?: string }
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

    const data: any = { updatedAt: new Date() };

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

    if (updates.avatarUrl) {
      if (!validator.isURL(updates.avatarUrl)) {
        throw new Error('Avatar URL must be a valid URL');
      }
      data.avatarUrl = updates.avatarUrl;
    } else if (!user.avatarUrl) {
      data.avatarUrl = DEFAULT_AVATAR_URL;
    }

    if (Object.keys(data).length === 1) {
      throw new Error('No valid updates provided');
    }

    await postgresPrisma.users.update({
      where: { id: userId },
      data,
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

      const existingUser = await postgresPrisma.users.findUnique({ where: { email } });
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
            elo: existingUser.elo,
            avatarUrl: existingUser.avatarUrl,
            language: existingUser.language,
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

      const existingUser = await postgresPrisma.users.findUnique({ where: { email } });
      if (existingUser) {
        this.logger.info(`Email already registered during Google login completion: ${email}`);
        throw new Error('This email has been used already for a standard account. Please use a different Google account.');
      }

      const existingUsername = await postgresPrisma.users.findFirst({
        where: { username: { equals: cleanUsername, mode: 'insensitive' } },
      });
      if (existingUsername) {
        this.logger.warn(`Duplicate username attempt during Google login: ${cleanUsername}`);
        throw new Error('Username already taken');
      }

      const randomPassword = Math.random().toString(36).slice(-12);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      const user = await postgresPrisma.users.create({
        data: {
          username: cleanUsername,
          email,
          hashedPassword,
          googleAuth: true,
          language: 'en',
          avatarUrl: DEFAULT_AVATAR_URL,
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
          elo: user.elo, 
          avatarUrl: user.avatarUrl,
          language: user.language,
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
    const user = await postgresPrisma.users.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      this.logger.warn(`Email not found for auth type check: ${cleanEmail}`);
      throw new Error('Email not found');
    }
    return { googleAuth: user.googleAuth };
  }
}

export default UsersService;