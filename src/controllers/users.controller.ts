import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import UsersService from '../services/users.service';
import { DiffieHellmanGroupConstructor } from 'crypto';

interface RegisterRequest {
  Body: { username: string; email: string; password: string };
}

interface LoginRequest {
  Body: { identifier: string; password: string };
}

interface RequestResetRequest {
  Body: { email: string };
}

interface ResetPasswordRequest {
  Body: { email: string; resetCode: string; newPassword: string };
}
interface ProfileRequest {
  Headers: { authorization?: string };
}

interface GetUserByUsernameRequest {
  Params: { username: string };
  Headers: { authorization?: string };
}

class UsersController {
  private usersService: UsersService;

  constructor(fastify: FastifyInstance) {
    this.usersService = new UsersService(fastify);
  }

  async register(
    request: FastifyRequest<RegisterRequest>, // Register a new user
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { username, email, password } = request.body;
      const result = await this.usersService.register(username, password, email);
      reply.status(201).send(result);
    } catch (error: any) {
      request.log.error(error);
      reply.status(400).send({ message: error.message });
    }
  }

  async login(
    request: FastifyRequest<LoginRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { identifier, password } = request.body;
      const result = await this.usersService.login(identifier, password);
      reply.status(200).send(result);
    } catch (error: any) {
      request.log.error(error);
      reply.status(401).send({ message: error.message });
    }
  }

  async requestPasswordReset(
    request: FastifyRequest<RequestResetRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { email } = request.body;
      await this.usersService.requestPasswordReset(email);
      reply.status(200).send({ message: 'Verification code sent' });
    } catch (error: any) {
      request.log.error(error);
      reply.status(400).send({ message: error.message });
    }
  }

  async resetPassword(
    request: FastifyRequest<ResetPasswordRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { email, resetCode, newPassword } = request.body;
      const result = await this.usersService.resetPassword(email, resetCode, newPassword);
      reply.status(200).send(result);
    } catch (error: any) {
      request.log.error(error);
      reply.status(400).send({ message: error.message });
    }
  }

  async getProfile(
    request: FastifyRequest<ProfileRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const token = request.headers.authorization?.split(' ')[1];
      if (!token) {
        reply.status(401).send({ message: 'Token required' });
        return;
      }
      const { username } = await this.usersService.verifyToken(token);
      const user = await this.usersService.getUser(username);
      reply.status(200).send({ user });
    } catch (error: any) {
      request.log.error(error);
      reply.status(401).send({ message: error.message });
    }
  }

  async getUserByUsername(
    request: FastifyRequest<GetUserByUsernameRequest>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { username } = request.params;
      const user = await this.usersService.getUser(username);
      reply.status(200).send({ user });
    } catch (error: any) {
      request.log.error(error);
      reply.status(404).send({ message: error.message });
    }
  }
}

export default UsersController;