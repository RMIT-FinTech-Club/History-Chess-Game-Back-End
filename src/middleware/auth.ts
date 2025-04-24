import { FastifyRequest, FastifyReply } from 'fastify';
import UsersService from '../services/users.service';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; username: string };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
      reply.status(401).send({ message: 'Authentication token required' });
      return;
    }
    const usersService = new UsersService(request.server);
    const user = await usersService.verifyToken(token);
    request.user = user; // Attach user to request for controller
  } catch (error: any) {
    reply.status(401).send({ message: 'Invalid or expired token' });
  }
}