import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import UserController from '../controllers/user.controller';
import { uploadController, AvatarRequest } from '../controllers/upload.controller';
import {
  createUserSchema,
  getUserSchema,
  updateAuthenticatedProfileSchema,
  deleteUserSchema,
  getAllUsersSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from './schemas/userSchema';
import { authMiddleware } from '../middleware/auth';

export default async function userRoutes(fastify: FastifyInstance) {
  const userController = new UserController(fastify);

  fastify.post('/users', {
    schema: createUserSchema,
    handler: userController.createUser.bind(userController),
  });

  fastify.get('/users/:id', {
    schema: getUserSchema,
    handler: userController.getUserById.bind(userController),
  });

  fastify.get('/users/profile', {
    preHandler: authMiddleware,
    handler: userController.getProfile.bind(userController),
  });

  fastify.put('/users/profile', {
    schema: updateAuthenticatedProfileSchema, // Use the correct schema
    preHandler: authMiddleware,
    handler: userController.updateAuthenticatedProfile.bind(userController),
  });

  fastify.get('/users', {
    schema: getAllUsersSchema,
    handler: userController.getAllUsers.bind(userController),
  });

  fastify.put('/users/:id', {
    schema: updateProfileSchema,
    handler: userController.updateProfile.bind(userController),
  });

  fastify.put('/users/update-password', {
    preHandler: authMiddleware,
    handler: userController.updatePassword.bind(userController),
  });

  fastify.delete('/users/:id', {
    schema: deleteUserSchema,
    handler: userController.deleteUser.bind(userController),
  });

  fastify.post('/users/login', {
    handler: userController.login.bind(userController),
  });

  fastify.post('/users/request-reset', {
    handler: userController.requestPasswordReset.bind(userController),
  });

  fastify.post('/users/reset-password', {
    handler: userController.resetPassword.bind(userController),
  });

  fastify.post('/users/verify-reset-code', {
    handler: userController.verifyResetCode.bind(userController),
  });

  fastify.get('/users/google-callback', {
    handler: userController.googleCallback.bind(userController),
  });

  fastify.post('/users/complete-google-login', {
    handler: userController.completeGoogleLogin.bind(userController),
  });

  fastify.post('/users/check-auth-type', {
    handler: userController.checkAuthType.bind(userController),
  });

  fastify.post('/users/:id/avatar', {
    schema: uploadAvatarSchema,
    preHandler: authMiddleware, // Ensure token validation
    handler: async (request: FastifyRequest<AvatarRequest>, reply: FastifyReply) => {
      await uploadController.uploadAvatar(request, reply, fastify);
    },
  });

  fastify.delete('/users/:id/avatar', {
    handler: async (request: FastifyRequest<AvatarRequest>, reply: FastifyReply) => {
      await uploadController.deleteAvatar(request, reply, fastify);
    },
  });
}