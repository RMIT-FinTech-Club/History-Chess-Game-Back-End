import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../services/auth.service';

export const authenticate = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const authHeader = request.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.code(401).send({ message: 'Authentication required' });
        }
        
        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        
        if (!payload) {
            return reply.code(401).send({ message: 'Invalid or expired token' });
        }
        
        request.user = { id: payload.userId };
        
    } catch (error) {
        return reply.code(401).send({ message: 'Authentication failed' });
    }
};

// Extend FastifyRequest to include user property
declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            id: string;
        };
    }
}