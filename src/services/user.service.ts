import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { FastifyInstance } from 'fastify';
import validator from 'validator';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';
import basePath from '../types/pathConfig';

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
  avatarUrl?: string | null | undefined;
}

interface ResetCodeEntry {
  code: string;
  expires: number;
}

interface UserTokenPayload {
  id: string;
  username: string;
  googleAuth: boolean;
}

interface TempTokenPayload {
  email: string;
}

type JWTPayload = UserTokenPayload | TempTokenPayload;

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
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      this.logger.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables');
      throw new Error('Google OAuth configuration is incomplete');
    }
    this.googleClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${basePath}/users/google-callback`
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
    return jwt.sign({ id, username, googleAuth } as UserTokenPayload, this.jwtSecret, { expiresIn: '1h', noTimestamp: true });
  }

  async createUser(data: CreateUserInput): Promise<{
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
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

      const token = this.generateToken(user.id, user.username, user.googleAuth);
      return {
        token,
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        language: user.language,
        elo: user.elo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }

  async getUserById(id: string): Promise<{
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    try {
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

      const token = this.generateToken(user.id, user.username, user.googleAuth);
      return {
        token,
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        language: user.language,
        elo: user.elo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }

  async getUserByEmail(email: string): Promise<{
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    try {
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

      const token = this.generateToken(user.id, user.username, user.googleAuth);
      return {
        token,
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        language: user.language,
        elo: user.elo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }

  async getAllUsers(limit: number = 10, offset: number = 0): Promise<{
    users: {
      id: string;
      username: string;
      email: string;
      walletAddress: string | null;
      avatarUrl: string | null;
      language: string;
      elo: number;
      createdAt: Date;
      updatedAt: Date;
    }[];
    total: number;
    limit: number;
    offset: number;
    token: string;
  }> {
    try {
      const users = await prisma.users.findMany({
        skip: offset,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      });

      const total = await prisma.users.count();

      const usersWithoutPasswords = users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        language: user.language,
        elo: user.elo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));

      const token = jwt.sign({ action: 'getAllUsers' }, this.jwtSecret, { expiresIn: '1h' });

      return {
        users: usersWithoutPasswords,
        total,
        limit,
        offset,
        token,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }

  async updateUser(id: string, data: UpdateUserInput): Promise<{
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    try {
      const updateData: any = {};

      if (data.username) updateData.username = this.validateUsername(data.username);
      if (data.email) updateData.email = this.validateEmail(data.email);
      if (data.password) updateData.hashedPassword = await bcrypt.hash(this.validatePassword(data.password), 10);
      if (data.walletAddress !== undefined) updateData.walletAddress = data.walletAddress;

      const updatedUser = await prisma.users.update({
        where: { id },
        data: updateData,
      });

      const token = this.generateToken(updatedUser.id, updatedUser.username, updatedUser.googleAuth);
      return {
        token,
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        walletAddress: updatedUser.walletAddress,
        avatarUrl: updatedUser.avatarUrl,
        language: updatedUser.language,
        elo: updatedUser.elo,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };
    } catch (error: unknown) {
      return null;
    }
  }

  async updateProfile(id: string, data: UpdateProfileInput): Promise<{
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    try {
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

      if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;

      if (Object.keys(updateData).length === 0) {
        throw new Error('No valid updates provided');
      }

      const updatedUser = await prisma.users.update({
        where: { id },
        data: updateData,
      });

      console.log('Updated user:', updatedUser);

      const newToken = this.generateToken(updatedUser.id, updatedUser.username, updatedUser.googleAuth);
      console.log('Generated token in updateProfile:', newToken);

      return {
        token: newToken,
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        walletAddress: updatedUser.walletAddress,
        avatarUrl: updatedUser.avatarUrl,
        language: updatedUser.language,
        elo: updatedUser.elo,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };
    } catch (error: unknown) {
      return null;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      await prisma.users.delete({
        where: { id },
      });
      return true;
    } catch (error: unknown) {
      return false;
    }
  }

  async login(identifier: string, password?: string, token?: string): Promise<{
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
      if (!identifier || typeof identifier !== 'string') {
        this.logger.warn(`Invalid identifier type: ${typeof identifier}`);
        throw new Error('Username or email must be a non-empty string');
      }

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

      console.log(`Login attempt: identifier=${cleanIdentifier}, hasToken=${!!token}, hasPassword=${!!password}, googleAuth=${user.googleAuth}`);

      if (token) {
        try {
          const decoded = jwt.verify(token, this.jwtSecret) as UserTokenPayload;
          if (decoded.id !== user.id || decoded.googleAuth !== user.googleAuth) {
            this.logger.warn(`Invalid token for user: ${cleanIdentifier}`);
            throw new Error('Invalid token');
          }
        } catch (error) {
          this.logger.warn(`Token verification failed for login: ${cleanIdentifier}`);
          throw new Error('Invalid or expired token');
        }
      } else if (password && !user.googleAuth) {
        const cleanPassword = this.validatePassword(password);
        const isMatch = await bcrypt.compare(cleanPassword, user.hashedPassword);
        if (!isMatch) {
          this.logger.warn(`Failed login attempt for ${cleanIdentifier}`);
          throw new Error('Invalid password');
        }
      } else if (!user.googleAuth) {
        this.logger.info(`Generating new token for manual user: ${cleanIdentifier}`);
      } else {
        this.logger.warn(`Attempted login without token for Google-authenticated user: ${cleanIdentifier}`);
        throw new Error('This account uses Google login. Please use Google to sign in or provide a valid token.');
      }

      const newToken = this.generateToken(user.id, user.username, user.googleAuth);
      return {
        token: newToken,
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        language: user.language,
        elo: user.elo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }

  async verifyToken(token: string): Promise<{ id: string; username: string; googleAuth: boolean }> {
    try {
      if (!token || typeof token !== 'string' || !validator.isLength(token, { max: 1024 })) {
        this.logger.warn(`Invalid token format: ${token ? token.length : 'empty'}`);
        throw new Error('Token must be a non-empty string (max 1024 chars)');
      }
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
      if ('email' in decoded) {
        throw new Error('Invalid token type');
      }
      if (!decoded.id || !decoded.username) throw new Error('Invalid token payload');
      const user = await prisma.users.findUnique({ where: { id: decoded.id } });
      console.log('Decoded token:', decoded);
      console.log('Database user:', user);
      if (!user || user.googleAuth !== decoded.googleAuth) {
        throw new Error('User not found or token mismatch');
      }
      if (user.username !== decoded.username) {
        console.warn(`Username mismatch: token=${decoded.username}, db=${user.username}`);
      }
      return { id: decoded.id, username: decoded.username, googleAuth: decoded.googleAuth };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Token verification failed: ${message}`);
      throw new Error('Invalid token');
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
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

      await this.transporter.sendMail(mailOptions);
      this.logger.info(`Verification code sent to ${cleanEmail}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send verification code to ${email}: ${message}`);
      throw new Error(`Failed to send verification code: ${message}`);
    }
  }

  async verifyResetCode(email: string, resetCode: string): Promise<void> {
    try {
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }

  async resetPassword(email: string, resetCode: string, newPassword: string): Promise<{
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
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
      return {
        token: newToken,
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        language: user.language,
        elo: user.elo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }

  async updatePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }

  async googleAuth(state: string): Promise<string> {
    try {
      const authUrl = this.googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: ['profile', 'email'],
        state,
        prompt: 'consent',
      });
      return authUrl;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Google auth error: ${message}`);
      throw new Error(message);
    }
  }

  async googleCallback(code: string, state: string): Promise<{ email: string; tempToken: string } | {
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
      this.logger.info(`Received Google callback with code: ${code}, state: ${state}`);
      if (!code) {
        this.logger.warn('Missing authorization code in Google callback');
        throw new Error('Invalid or missing authorization code');
      }
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
          id: existingUser.id,
          username: existingUser.username,
          email: existingUser.email,
          walletAddress: existingUser.walletAddress,
          avatarUrl: existingUser.avatarUrl,
          language: existingUser.language,
          elo: existingUser.elo,
          createdAt: existingUser.createdAt,
          updatedAt: existingUser.updatedAt,
        };
      }

      const tempToken = jwt.sign({ email } as TempTokenPayload, this.jwtSecret, { expiresIn: '10m' });
      console.log('Generated tempToken:', tempToken);
      return { email, tempToken };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Google callback error: ${message}, stack: ${error instanceof Error ? error.stack : undefined}`);
      throw new Error(message || 'Failed to authenticate with Google');
    }
  }

  async completeGoogleLogin(tempToken: string, username: string): Promise<{
    token: string;
    id: string;
    username: string;
    email: string;
    walletAddress: string | null;
    avatarUrl: string | null;
    language: string;
    elo: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
      const decoded = jwt.verify(tempToken, this.jwtSecret) as TempTokenPayload;
      console.log('Verified tempToken:', decoded);
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
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        avatarUrl: user.avatarUrl,
        language: user.language,
        elo: user.elo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Google login completion error: ${message}, stack: ${error instanceof Error ? error.stack : undefined}`);
      throw new Error(message || 'Failed to complete Google login');
    }
  }

  async checkAuthType(email: string): Promise<{ googleAuth: boolean }> {
    try {
      const cleanEmail = this.validateEmail(email);
      const user = await prisma.users.findUnique({ where: { email: cleanEmail } });
      if (!user) {
        this.logger.warn(`Email not found for auth type check: ${cleanEmail}`);
        throw new Error('Email not found');
      }
      return { googleAuth: user.googleAuth };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(message);
    }
  }
}