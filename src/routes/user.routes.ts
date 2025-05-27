import { FastifyInstance } from 'fastify';
import { userController } from '../controllers/user.controller';
import { uploadController } from '../controllers/upload.controller';
import {
    createUserSchema,
    getUserSchema,
    updateUserSchema,
    deleteUserSchema,
    getAllUsersSchema,
    updateProfileSchema,
    // Add avatar schemas if you have them
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

    // Get user profile (authenticated)
    fastify.get('/users/profile', {
        // You might want to add a schema here
        handler: userController.getProfile,
    });

    // Get all users
    fastify.get('/users', {
        schema: getAllUsersSchema,
        handler: userController.getAllUsers,
    });

    // Update a user
    // fastify.put('/users/:id', {
    //     schema: updateUserSchema,
    //     handler: userController.updateUser,
    // });

    // Update user profile
    fastify.put('/users/:id', {
        schema: updateProfileSchema,
        handler: userController.updateProfile,
    });

    // Upload avatar
    fastify.post('/users/:id/avatar', {
        // Note: Can't use standard schema validation for file uploads
        handler: uploadController.uploadAvatar,
    });

    // Delete avatar
    fastify.delete('/users/:id/avatar', {
        handler: uploadController.deleteAvatar,
    });

    // Delete a user
    fastify.delete('/users/:id', {
        schema: deleteUserSchema,
        handler: userController.deleteUser,
    });
}