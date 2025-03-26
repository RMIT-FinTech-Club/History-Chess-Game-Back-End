import { FastifyInstance } from 'fastify';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
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

  constructor(fastify: FastifyInstance) {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
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

  async register(username: string, password: string, email: string): Promise<UserProfileResponse> {
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

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      elo: user.elo,
      createdAt: user.createdAt,
    };
  }

  async login(username: string, password: string): Promise<{ token: string; user: UserProfileResponse }> {
    const user = await postgresPrisma.users.findUnique({ where: { username } });
    if (!user) throw new Error('User not found');
    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) throw new Error('Invalid password');
    const token = jwt.sign({ id: user.id, username: user.username }, this.jwtSecret, { expiresIn: '1h' });
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        elo: user.elo,
        createdAt: user.createdAt,
      },
    };
  }

  async verifyToken(token: string): Promise<{ id: string; username: string }> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { id: string; username: string; iat?: number; exp?: number };
      if (!decoded.id || !decoded.username) throw new Error('Invalid token payload');
      return { id: decoded.id, username: decoded.username };
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async getUser(username: string): Promise<UserProfileResponse> {
    const user = await postgresPrisma.users.findUnique({ where: { username } });
    if (!user) throw new Error('User not found');
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      elo: user.elo,
      createdAt: user.createdAt,
    };
  }
}

export default UsersService;