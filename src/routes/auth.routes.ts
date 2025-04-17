import { FastifyInstance } from 'fastify';
import { authController } from '../controllers/auth.controller';
import {
    loginSchema,
    registerSchema,
    logoutSchema,
    getCurrentUserSchema,
    changePasswordSchema
} from '../auth/authSchema';

// Define API endpoints for authentication and connect them to the controller

export default async function authRoutes(fastify: FastifyInstance) {
    // Login user
    fastify.post('/auth/login', {
        schema: loginSchema,
        handler: authController.login
    });
    
    // Register new user
    fastify.post('/auth/register', {
        schema: registerSchema,
        handler: authController.register
    });
    
    // Logout user
    fastify.post('/auth/logout', {
        schema: logoutSchema,
        handler: authController.logout
    });
    
    // Get current user profile
    fastify.get('/users/profile', {
        schema: getCurrentUserSchema,
        handler: authController.getCurrentUser
    });
    
    // Change password
    fastify.put('/users/:id/password', {
        schema: changePasswordSchema,
        handler: authController.changePassword
    });
}