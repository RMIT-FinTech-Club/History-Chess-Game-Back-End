import { FastifyRequest, FastifyReply } from 'fastify';
import UsersService from '../services/users.service';
import { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; username: string };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');
  const fastify = request.server as FastifyInstance;
  const usersService = new UsersService(fastify);

  try {
    const decoded = await usersService.verifyToken(token);
    request.user = decoded;
  } catch (error: any) {
    reply.status(401).send({ message: 'Invalid or expired token' });
  }
}