import { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import UsersService from '../services/users.service';

// Extend Fastify's request type directly here
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      username: string;
    };
  }
}

export const authMiddleware: preHandlerHookHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const usersService = new UsersService(request.server);

  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      reply.code(401).send({ message: 'No token provided' });
      return;
    }

    const user = await usersService.verifyToken(token);
    request.user = user;

    const params = request.params as { username?: string };
    if (params.username && params.username !== user.username) {
      reply.code(403).send({ message: 'You can only access your own data' });
      return;
    }
  } catch (error: any) {
    reply.code(401).send({ message: error.message });
  }
};