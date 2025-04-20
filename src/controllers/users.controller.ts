import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import UsersService from '../services/users.service';

class UsersController {
  private usersService: UsersService;

  constructor(fastify: FastifyInstance) {
    this.usersService = new UsersService(fastify);
  }

  async register(request: FastifyRequest<{ Body: { username: string; password: string; email: string } }>, reply: FastifyReply) {
    const { username, password, email } = request.body;
    try {
      const result = await this.usersService.register(username, password, email);
      reply.code(201).send(result);
    } catch (error: any) {
      reply.code(400).send({ message: error.message });
    }
  }

  async login(request: FastifyRequest<{ Body: { username: string; password: string } }>, reply: FastifyReply) {
    const { username, password } = request.body;
    try {
      const result = await this.usersService.login(username, password);
      reply.send(result);
    } catch (error: any) {
      reply.code(401).send({ message: error.message });
    }
  }

  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = await this.usersService.getUser(request.user!.username);
      reply.send({ message: `Profile for ${user.username}`, user });
    } catch (error: any) {
      reply.code(404).send({ message: error.message });
    }
  }

  async getUserByUsername(request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) {
    const { username } = request.params;
    try {
      const user = await this.usersService.getUser(username);
      reply.send({ message: `Profile for ${username}`, user });
    } catch (error: any) {
      reply.code(404).send({ message: error.message });
    }
  }

  async requestPasswordReset(request: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) {
    const { email } = request.body;
    try {
      await this.usersService.requestPasswordReset(email);
      reply.send({ message: 'Verification code sent to your email (check console for testing)' });
    } catch (error: any) {
      reply.code(400).send({ message: error.message });
    }
  }

  async resetPassword(request: FastifyRequest<{ Body: { email: string; resetCode: string; newPassword: string } }>, reply: FastifyReply) {
    const { email, resetCode, newPassword } = request.body;
    try {
      const { token } = await this.usersService.resetPassword(email, resetCode, newPassword);
      reply.send({ message: 'Password reset successfully', token });
    } catch (error: any) {
      reply.code(400).send({ message: error.message }); // Ensure 400 for all errors
    }
  }
}

export default UsersController;