import { FastifyInstance } from 'fastify';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { postgresPrisma } from '../configs/prismaClient';

interface UserProfileResponse {
  id: string;
  username: string;
  email: string;
  walletAddress: string | null;
  elo: number | null;
  createdAt: Date;
  updatedAt: Date;
}

class UsersService {
  private jwtSecret: string;

  constructor(fastify: FastifyInstance) {
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

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const user = await postgresPrisma.users.create({
        data: {
          username,
          email: email || '',
          hashedPassword,
          walletAddress: null,
          elo: 1500,
        },
        select: {
          id: true,
          username: true,
          email: true,
          walletAddress: true,
          elo: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      console.log(`User created: ${username} (ID: ${user.id}) at ${user.createdAt}`);
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
      const user = await postgresPrisma.users.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          email: true,
          walletAddress: true,
          elo: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        console.log(`Profile retrieval failed: User ${username} not found`);
        throw new Error('User not found');
      }

      console.log(`User profile retrieved: ${username} (ID: ${user.id})`);
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
    const user = await postgresPrisma.users.findUnique({
      where: { username },
    });

    if (!user) {
      console.log(`Login failed: User ${username} not found`);
      throw new Error('User not found');
    }

    const isMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!isMatch) {
      console.log(`Login failed: Invalid credentials for ${username}`);
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ sub: user.id, username }, this.jwtSecret, { expiresIn: '1h' });
    console.log(`User ${username} logged in successfully`);
    return {
      access_token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        elo: user.elo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
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