import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

interface UserProfileResponse {
  user_id: number;
  username: string;
  email: string;
  wallet_address: string | null;
  elo: number | null;
  created_time: Date;
  updated_time: Date;
}

class UsersService {
  private prisma: PrismaClient;
  private jwtSecret: string;

  constructor(fastify: FastifyInstance) {
    this.prisma = fastify.prisma;
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
  }

  private validatePassword(password: string): void {
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{9,}$/;
    if (!passwordRegex.test(password)) {
      throw new Error(
        'Password must be over 8 characters, include at least one uppercase letter, one number, and one special character (!@#$%^&*)'
      );
    }
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!emailRegex.test(email)) {
      throw new Error('Email must be a valid Gmail address (e.g., username@gmail.com)');
    }
  }

  private validateUsername(username: string): void {
    if (username.length > 50) {
      throw new Error('Username must not exceed 50 characters');
    }
  }

  async createUserProfileService(username: string, password: string, email?: string): Promise<UserProfileResponse> {
    this.validateUsername(username);
    if (email) this.validateEmail(email);
    this.validatePassword(password);

    const password_hash = await bcrypt.hash(password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          email: email || '',
          password_hash,
          wallet_address: null,
          elo: 1500, // Default chess Elo rating
          created_time: new Date(),
          updated_time: new Date(),
        },
        select: {
          user_id: true,
          username: true,
          email: true,
          wallet_address: true,
          elo: true,
          created_time: true,
          updated_time: true,
        },
      });

      console.log(`User created: ${username} (ID: ${user.user_id}) at ${user.created_time}`);
      return user;
    } catch (error: any) {
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        throw new Error(`${target.includes('username') ? 'Username' : 'Email'} already exists`);
      }
      console.error('User creation failed:', error);
      throw new Error('Failed to create user profile due to database error');
    }
  }

  async getUserProfileByUsernameService(username: string): Promise<UserProfileResponse> {
    this.validateUsername(username);

    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
        select: {
          user_id: true,
          username: true,
          email: true,
          wallet_address: true,
          elo: true,
          created_time: true,
          updated_time: true,
        },
      });

      if (!user) {
        console.log(`Profile retrieval failed: User ${username} not found`);
        throw new Error('User not found');
      }

      console.log(`User profile retrieved: ${username} (ID: ${user.user_id})`);
      return user;
    } catch (error: any) {
      console.error(`Failed to retrieve user profile for ${username}:`, error);
      if (error.message === 'User not found') throw error;
      throw new Error('Failed to retrieve user profile due to database error');
    }
  }

  async login({
    username,
    password,
  }: {
    username: string;
    password: string;
  }): Promise<{ access_token: string; user: UserProfileResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      console.log(`Login failed: User ${username} not found`);
      throw new Error('User not found');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log(`Login failed: Invalid credentials for ${username}`);
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ sub: user.user_id, username }, this.jwtSecret, { expiresIn: '1h' });
    console.log(`User ${username} logged in successfully`);
    return {
      access_token: token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        wallet_address: user.wallet_address,
        elo: user.elo,
        created_time: user.created_time,
        updated_time: user.updated_time,
      },
    };
  }

  async verifyToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      console.error('Token verification failed:', error);
      throw new Error('Invalid token');
    }
  }
}

export default UsersService;