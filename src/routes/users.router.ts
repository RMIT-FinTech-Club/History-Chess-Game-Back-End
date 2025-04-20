import { FastifyInstance } from 'fastify';
import UsersController from '../controllers/users.controller';
import { authMiddleware } from '../middleware/auth';

interface ProfileRoute {
  Params: { username: string };
}

interface ResetPasswordRoute {
  Body: { email: string; resetCode: string; newPassword: string };
}

export default async function (fastify: FastifyInstance) {
  const usersController = new UsersController(fastify);

  fastify.post('/register', usersController.register.bind(usersController));
  fastify.post('/login', usersController.login.bind(usersController));
  fastify.post('/request-reset', usersController.requestPasswordReset.bind(usersController));
  fastify.post<ResetPasswordRoute>('/reset-password', usersController.resetPassword.bind(usersController));

  fastify.get('/profile', { preHandler: authMiddleware }, usersController.getProfile.bind(usersController));
  fastify.get<ProfileRoute>('/profile/:username', { preHandler: authMiddleware }, usersController.getUserByUsername.bind(usersController));
}