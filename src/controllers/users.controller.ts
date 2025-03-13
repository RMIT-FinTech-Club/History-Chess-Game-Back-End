import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import UsersService from '../services/users.service';

interface RegisterRequestBody {
  username: string;
  email?: string;
  password: string;
}

interface LoginRequestBody {
  username: string;
  password: string;
}

interface GetProfileRequestParams {
  username: string;
}

class UsersController {
  private usersService: UsersService;

  constructor(fastify: FastifyInstance) {
    this.usersService = new UsersService(fastify);
  }

  async register(request: FastifyRequest<{ Body: RegisterRequestBody }>, reply: FastifyReply): Promise<void> {
    try {
      const user = await this.usersService.createUserProfileService(
        request.body.username,
        request.body.password,
        request.body.email
      );
      reply.code(201).send(user);
    } catch (error: any) {
      reply.code(400).send({ message: error.message });
    }
  }

  async login(request: FastifyRequest<{ Body: LoginRequestBody }>, reply: FastifyReply): Promise<void> {
    try {
      const result = await this.usersService.login(request.body);
      reply.send(result);
    } catch (error: any) {
      reply.code(401).send({ message: error.message });
    }
  }

  async getProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new Error('No token provided');
      const user = await this.usersService.verifyToken(token);
      reply.send({ message: 'Protected data', user });
    } catch (error: any) {
      reply.code(401).send({ message: error.message });
    }
  }

  async getUserProfileByUsername(
    request: FastifyRequest<{ Params: GetProfileRequestParams }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { username } = request.params;
      const user = await this.usersService.getUserProfileByUsernameService(username);
      reply.send(user);
    } catch (error: any) {
      if (error.message === 'User not found') {
        reply.code(404).send({ message: error.message });
      } else {
        reply.code(500).send({ message: error.message });
      }
    }
  }
}

export default UsersController;