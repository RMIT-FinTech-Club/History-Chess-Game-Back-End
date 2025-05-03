import { FastifyInstance } from 'fastify';
import { userController } from '../controllers/user.controller';
import {
    createUserSchema,
    getUserSchema,
    updateUserSchema,
    deleteUserSchema,
    getAllUsersSchema, updateProfileSchema,
} from './schemas/userSchema';

export default async function userRoutes(fastify: FastifyInstance) {
    // Create a new user
    fastify.post('/users', {
        schema: createUserSchema,
        handler: userController.createUser,
    });
    
    // Get a user by ID
    fastify.get('/users/:id', {
        schema: getUserSchema,
        handler: userController.getUserById,
    });
    
    // Get all users
    fastify.get('/users', {
        schema: getAllUsersSchema,
        handler: userController.getAllUsers,
    });
    
    // Update a user
    fastify.put('/users/:id', {
        schema: updateUserSchema,
        handler: userController.updateUser,
    });

    fastify.put('/users/:id/profile', {
        schema: updateProfileSchema,
        handler: userController.updateProfile,
    });
    
    // Delete a user
    fastify.delete('/users/:id', {
        schema: deleteUserSchema,
        handler: userController.deleteUser,
    });
}