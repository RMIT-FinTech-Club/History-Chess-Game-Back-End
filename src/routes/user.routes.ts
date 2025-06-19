import { FastifyInstance, FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
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
interface ProfileUpdateRoute extends RouteGenericInterface {
  Body: {
    username?: string;
    avatarUrl?: string | null;
  };
}
interface AvatarRequest {
  Params: { id: string };
  Body: { file: any }; // Multipart file
  Headers: { authorization?: string };
}

export default async function userRoutes(fastify: FastifyInstance) {
  const userController = new UserController(fastify);

  fastify.post('/users', {
    schema: createUserSchema,
    handler: userController.createUser.bind(userController),
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
    handler: userController.getProfile.bind(userController),
  });

  fastify.put('/users/profile', {
    schema: updateAuthenticatedProfileSchema,
    preHandler: authenticate,
    handler: async (request: FastifyRequest<ProfileUpdateRoute>, reply: FastifyReply) => {
      return userController.updateAuthenticatedProfile(request, reply);
    },
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
    handler: userController.updatePassword.bind(userController),
  });

  fastify.delete('/users/:id', {
    schema: deleteUserSchema,
    preHandler: [authenticate, authorize],
    handler: async (request: FastifyRequest<IdParams>, reply: FastifyReply) => {
      return userController.deleteUser(request, reply);
    },
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