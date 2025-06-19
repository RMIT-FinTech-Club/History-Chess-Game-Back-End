import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

// Define JWT payload interface
interface UserPayload {
  id: string;
  username: string;
  googleAuth: boolean;
}

// Extend FastifyRequest with custom authUser property
declare module 'fastify' {
  interface FastifyRequest {
    authUser?: UserPayload;
  }
}

// Authentication: Verify JWT and set request.authUser
export async function authenticate(
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
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

  try {
    const decoded = jwt.verify(token, jwtSecret) as UserPayload;
    request.log.info(`Token verified: userId=${decoded.id}, username=${decoded.username}`);
    request.authUser = decoded;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    request.log.warn(`Token verification failed: ${errorMessage}, token=${token}`);
    reply.status(401).send({ message: 'Invalid or expired token' });
  }
}

// Authorization: Check if user is authorized to access resource
export async function authorize(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userIdParam = (request.params as { id?: string }).id;
  if (userIdParam && request.authUser && request.authUser.id !== userIdParam) {
    request.log.warn(`Unauthorized access attempt: userId=${request.authUser.id}, requestedId=${userIdParam}`);
    reply.status(403).send({ message: 'You are not authorized to access this resource' });
    return;
  }
}