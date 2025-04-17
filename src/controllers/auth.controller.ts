// Handle HTTP requests and responses for authentication

import { FastifyRequest, FastifyReply } from "fastify";
import { authService, verifyToken } from "../services/auth.service";

interface LoginInput {
    email: string;
    password: string;
}

interface RegisterInput {
    username: string;
    email: string;
    password: string;
    walletAddress?: string;
}

interface ChangePasswordInput {
    currentPassword?: string;
    password: string;
}

interface IdParams {
    id: string;
}

export const authController = {
    // Login user
    async login(
        request: FastifyRequest<{ Body: LoginInput }>,
        reply: FastifyReply
    ) {
        const { email, password } = request.body;
        
        try {
            const result = await authService.login(email, password);
            
            if (!result) {
                return reply.code(401).send({ message: 'Invalid email or password' });
            }
            
            return reply.code(200).send(result);
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ message: 'Internal server error' });
        }
    },
    
    // Register new user
    async register(
        request: FastifyRequest<{ Body: RegisterInput }>,
        reply: FastifyReply
    ) {
        try {
            const result = await authService.register(request.body);
            
            if ('error' in result) {
                return reply.code(409).send({ message: result.error });
            }
            
            return reply.code(201).send(result);
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ message: 'Internal server error' });
        }
    },
    
    // Logout user (just a placeholder as the frontend will remove the token)
    async logout(
        request: FastifyRequest,
        reply: FastifyReply
    ) {
        return reply.code(200).send({ message: 'Logged out successfully' });
    },
    
    // Get current user profile
    async getCurrentUser(
        request: FastifyRequest,
        reply: FastifyReply
    ) {
        try {
            const authHeader = request.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.code(401).send({ message: 'Authentication required' });
            }
            
            const token = authHeader.split(' ')[1];
            const user = await authService.getCurrentUser(token);
            
            if (!user) {
                return reply.code(401).send({ message: 'Invalid or expired token' });
            }
            
            return reply.code(200).send(user);
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ message: 'Internal server error' });
        }
    },
    
    // Change password
    async changePassword(
        request: FastifyRequest<{ 
            Params: IdParams; 
            Body: ChangePasswordInput;
            Headers: { authorization: string } 
        }>,
        reply: FastifyReply
    ) {
        try {
            const { id } = request.params;
            const { password, currentPassword } = request.body;
            
            // Verify the token belongs to the user or an admin
            const authHeader = request.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.code(401).send({ message: 'Authentication required' });
            }
            
            const token = authHeader.split(' ')[1];
            const payload = verifyToken(token);
            
            // Only allow changing password if token matches the user ID
            if (!payload || payload.userId !== id) {
                return reply.code(403).send({ message: 'Unauthorized to change this password' });
            }
            
            const result = await authService.changePassword(id, password, currentPassword);
            
            if (!result.success) {
                return reply.code(400).send({ message: result.message });
            }
            
            return reply.code(200).send({ message: result.message });
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ message: 'Internal server error' });
        }
    }
};