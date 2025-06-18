import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import UserController from '../controllers/user.controller';
import { uploadController } from '../controllers/upload.controller';
import {
  createUserSchema,
  getUserSchema,
  updateAuthenticatedProfileSchema,
  deleteUserSchema,
  getAllUsersSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from './schemas/userSchema';
import { authenticate, authorize } from '../middleware/auth';

// Define request interfaces to match schemas
interface IdParams {
  Params: { id: string };
}
interface QueryParams {
  Querystring: { limit?: number; offset?: number };
}
interface UpdateProfileRequest {
  Params: { id: string };
  Body: { username?: string };
}
interface AvatarRequest {
  Params: { id: string };
  Body: { file: any }; // Multipart file
  Headers: { authorization?: string }; // Matches upload.controller.ts
}

export default async function userRoutes(fastify: FastifyInstance) {
  const userController = new UserController(fastify);

  fastify.post('/users', {
    schema: createUserSchema,
    handler: userController.createUser,
  });

  fastify.get('/users/:id', {
    schema: getUserSchema,
    preHandler: [authenticate, authorize],
    handler: async (request: FastifyRequest<IdParams>, reply: FastifyReply) => {
      return userController.getUserById(request, reply);
    },
  });

  fastify.get('/users/profile', {
    preHandler: authenticate,
    handler: userController.getProfile,
  });

  fastify.put('/users/profile', {
    schema: updateAuthenticatedProfileSchema,
    preHandler: authenticate,
    handler: userController.updateAuthenticatedProfile,
  });

  fastify.get('/users', {
    schema: getAllUsersSchema,
    preHandler: authenticate,
    handler: async (request: FastifyRequest<QueryParams>, reply: FastifyReply) => {
      return userController.getAllUsers(request, reply);
    },
  });

  fastify.put('/users/:id', {
    schema: updateProfileSchema,
    preHandler: [authenticate, authorize],
    handler: async (request: FastifyRequest<UpdateProfileRequest>, reply: FastifyReply) => {
      return userController.updateProfile(request, reply);
    },
  });

  fastify.put('/users/update-password', {
    preHandler: authenticate,
    handler: userController.updatePassword,
  });

  fastify.delete('/users/:id', {
    schema: deleteUserSchema,
    preHandler: [authenticate, authorize],
    handler: async (request: FastifyRequest<IdParams>, reply: FastifyReply) => {
      return userController.deleteUser(request, reply);
    },
  });

  fastify.post('/users/login', {
    handler: userController.login,
  });

  fastify.post('/users/request-reset', {
    handler: userController.requestPasswordReset,
  });

  fastify.post('/users/reset-password', {
    handler: userController.resetPassword,
  });

  fastify.post('/users/verify-reset-code', {
    handler: userController.verifyResetCode,
  });

  fastify.get('/users/google-callback', {
    handler: userController.googleCallback,
  });

  fastify.post('/users/complete-google-login', {
    handler: userController.completeGoogleLogin,
  });

  fastify.post('/users/check-auth-type', {
    handler: userController.checkAuthType,
  });

  fastify.post('/users/:id/avatar', {
    schema: uploadAvatarSchema,
    preHandler: [authenticate, authorize],
    handler: async (request: FastifyRequest<AvatarRequest>, reply: FastifyReply) => {
      await uploadController.uploadAvatar(request, reply, fastify);
    },
  });

  fastify.delete('/users/:id/avatar', {
    preHandler: [authenticate, authorize],
    handler: async (request: FastifyRequest<AvatarRequest>, reply: FastifyReply) => {
      await uploadController.deleteAvatar(request, reply, fastify);
    },
  });
}