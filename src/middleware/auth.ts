import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { UserService } from '../services/user.service';

// Extend @fastify/jwt to define JWT payload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; username: string; googleAuth: boolean };
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
  const userService = new UserService(fastify);

  try {
    const decoded = await userService.verifyToken(token);
    request.user = decoded;
  } catch (error: any) {
    reply.status(401).send({ message: 'Invalid or expired token' });
  }
}