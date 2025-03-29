import { FastifyInstance } from 'fastify';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as nodemailer from 'nodemailer';
import { postgresPrisma } from '../configs/prismaClient';

interface UserProfileResponse {
  id: string;
  username: string;
  email: string;
  walletAddress: string | null;
  elo: number;
  createdAt: Date;
}

class UsersService {
  private jwtSecret: string;
  private transporter: nodemailer.Transporter;

  constructor(fastify: FastifyInstance) {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password', // Use App Password if 2FA is on
      },
    });
  }

  private validateUsername(username: string): void {
    if (!username || username.length < 3 || username.length > 50) {
      throw new Error('Username must be between 3 and 50 characters');
    }
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error('Email must be a valid Gmail address (e.g., user@gmail.com)');
    }
  }

  private validatePassword(password: string): void {
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{9,}$/;
    if (!password || !passwordRegex.test(password)) {
      throw new Error('Password must be at least 9 characters, with 1 uppercase, 1 number, and 1 special character (!@#$%^&*)');
    }
  }

  private generateToken(id: string, username: string): string {
    return jwt.sign({ id, username }, this.jwtSecret, { expiresIn: '1h', noTimestamp: true }); // noTimestamp to keep it static
  }

  async register(username: string, password: string, email: string): Promise<{ token: string; user: UserProfileResponse }> {
    this.validateUsername(username);
    this.validateEmail(email);
    this.validatePassword(password);

    const existingUser = await postgresPrisma.users.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await postgresPrisma.users.create({
      data: {
        username,
        hashedPassword,
        email,
      },
    });
    const token = this.generateToken(user.id, user.username);
    return {
      token,
      user: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress, elo: user.elo, createdAt: user.createdAt },
    };
  }

  async login(username: string, password: string): Promise<{ token: string; user: UserProfileResponse }> {
    const user = await postgresPrisma.users.findUnique({ where: { username } });
    if (!user) throw new Error('User not found');
    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) throw new Error('Invalid password');
    const token = this.generateToken(user.id, user.username); // Same token as register
    return {
      token,
      user: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress, elo: user.elo, createdAt: user.createdAt },
    };
  }

  async verifyToken(token: string): Promise<{ id: string; username: string }> {
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
    const user = await postgresPrisma.users.findUnique({ where: { username } });
    if (!user) throw new Error('User not found');
    return { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress, elo: user.elo, createdAt: user.createdAt };
  }

  async requestPasswordReset(email: string): Promise<string> {
    const user = await postgresPrisma.users.findUnique({ where: { email } });
    if (!user) throw new Error('Email not found');

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: 'Password Reset Verification Code',
      text: `Your verification code is: ${resetCode}. It expires in 15 minutes.`,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Verification code ${resetCode} sent to ${email}`);
    } catch (error) {
      console.error('Email sending failed:', error);
      // Log it for now if email fails
      console.log(`Fallback: Verification code for ${email}: ${resetCode}`);
    }

    return resetCode; // Return for testing; in production, don’t return this
  }

  async resetPassword(email: string, resetCode: string, newPassword: string): Promise<{ token: string }> {
    const user = await postgresPrisma.users.findUnique({ where: { email } });
    if (!user) throw new Error('Email not found');

    // For now, assume resetCode is checked manually (e.g., via console log)
    // In production, store resetCode temporarily in DB with expiration
    const expectedCode = await this.requestPasswordReset(email); // Simulate check
    if (resetCode !== expectedCode) throw new Error('Invalid verification code');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await postgresPrisma.users.update({
      where: { email },
      data: { hashedPassword },
    });
    const newToken = this.generateToken(user.id, user.username); // New token after reset
    return { token: newToken };
  }
}

export default UsersService;