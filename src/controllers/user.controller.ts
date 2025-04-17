// Handle HTTP requests and responses

import { FastifyRequest, FastifyReply } from 'fastify';
import { userService, CreateUserInput, UpdateUserInput } from '../services/user.service';

interface IdParams { // (e.g., /users/:id)
    id: string;
}

interface QueryParams { // (e.g., /users?limit=10&offset=0)
    limit?: number;
    offset?: number;
}

export const userController = {
    // Create a new user
    async createUser(
        request: FastifyRequest<{ Body: CreateUserInput }>,
        reply: FastifyReply
    ) {
        try {
            const user = await userService.createUser(request.body);
            return reply.code(201).send(user);
        } catch (error) {
            request.log.error(error);
            if ((error as any).code === 'P2002') {
                // Prisma unique constraint error
                return reply.code(409).send({ 
                    message: 'Username, email, or wallet address already exists' 
                });
            }
            return reply.code(500).send({ message: 'Internal server error' });
        }
    },
    
    // Get a user by ID
    async getUserById(
        request: FastifyRequest<{ Params: IdParams }>,
        reply: FastifyReply
    ) {
        const { id } = request.params;
        const user = await userService.getUserById(id);
        
        if (!user) {
            return reply.code(404).send({ message: 'User not found' });
        }
        
        return reply.code(200).send(user);
    },
    
    // Get all users
    async getAllUsers(
        request: FastifyRequest<{ Querystring: QueryParams }>,
        reply: FastifyReply
    ) {
        const limit = request.query.limit || 10;
        const offset = request.query.offset || 0;
        
        const result = await userService.getAllUsers(limit, offset);
        return reply.code(200).send(result);
    },
    
    // Update a user
    async updateUser(
        request: FastifyRequest<{ Params: IdParams; Body: UpdateUserInput }>,
        reply: FastifyReply
    ) {
        const { id } = request.params;
        
        try {
            const updatedUser = await userService.updateUser(id, request.body);
            
            if (!updatedUser) {
                return reply.code(404).send({ message: 'User not found' });
            }
            
            return reply.code(200).send(updatedUser);
        } catch (error) {
            request.log.error(error);
            if ((error as any).code === 'P2002') {
                // Prisma unique constraint error
                return reply.code(409).send({ 
                    message: 'Username, email, or wallet address already exists' 
                });
            }
            return reply.code(500).send({ message: 'Internal server error' });
        }
    },
    
    // Delete a user
    async deleteUser(
        request: FastifyRequest<{ Params: IdParams }>,
        reply: FastifyReply
    ) {
        const { id } = request.params;
        const deleted = await userService.deleteUser(id);
        
        if (!deleted) {
            return reply.code(404).send({ message: 'User not found' });
        }
        
        return reply.code(200).send({ message: 'User deleted successfully' });
    },
};