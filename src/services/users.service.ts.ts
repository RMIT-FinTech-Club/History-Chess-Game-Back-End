import { FastifyInstance } from 'fastify';
import { Pool, QueryResult } from 'pg';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

interface User {
  id: number;
  username: string;
  email: string;
  password?: string; // Optional in responses
}

class UsersService {
  private db: Pool; // Define db as Pool type from pg
  private jwtSecret: string = 'your-secret-key';

  constructor(fastify: FastifyInstance) {
    this.db = (fastify as any).db; // Pool
  }

  validatePassword(password: string): void {
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{9,}$/;
    if (!passwordRegex.test(password)) {
      throw new Error(
        'Password must be over 8 characters, include at least one uppercase letter, one number, and one special character (!@#$%^&*)'
      );
    }
  }

  validateEmail(email: string): void {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!emailRegex.test(email)) {
      throw new Error('Email must be a valid Gmail address (e.g., username@gmail.com)');
    }
  }

  async create({ username, email, password }: { username: string; email: string; password: string }): Promise<User> {
    this.validateEmail(email);
    this.validatePassword(password);

    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      RETURNING id, username, email
    `;
    try {
      const result: QueryResult<User> = await this.db.query(query, [username, email, hashedPassword]);
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('Username or email already exists');
      }
      throw error;
    }
  }

  async login({ username, password }: { username: string; password: string }): Promise<{ access_token: string; user: User }> {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result: QueryResult<User> = await this.db.query(query, [username]);
    const user = result.rows[0];

    if (!user) throw new Error('User not found');
    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) throw new Error('Invalid credentials');

    const token = jwt.sign({ sub: user.id, username }, this.jwtSecret, { expiresIn: '1h' });
    return {
      access_token: token,
      user: { id: user.id, username, email: user.email },
    };
  }

  async verifyToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}

export default UsersService;