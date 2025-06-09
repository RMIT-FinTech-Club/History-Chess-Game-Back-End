import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { UserService } from '../services/user.service';
import jwt from 'jsonwebtoken';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    request.log.warn(`Missing or invalid Authorization header: ${authHeader}`);
    reply.status(401).send({ message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');
  const fastify = request.server as FastifyInstance;
  const userService = new UserService(fastify);
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

  try {
    const decoded = jwt.verify(token, jwtSecret) as { id: string; username: string; googleAuth: boolean };
    request.log.info(`Token verified: userId=${decoded.id}, username=${decoded.username}`);
    request.user = decoded as { id: string; username: string; googleAuth: boolean };
  } catch (error: any) {
    request.log.warn(`Token verification failed: ${error.message}, token=${token}`);
    reply.status(401).send({ message: 'Invalid or expired token' });
  }
}