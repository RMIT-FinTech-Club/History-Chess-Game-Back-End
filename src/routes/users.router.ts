import { FastifyInstance, RouteGenericInterface } from 'fastify';
import UsersController from '../controllers/users.controller';
import { authMiddleware } from '../middleware/auth';

// Define route-specific interfaces
export interface ProfileRequest extends RouteGenericInterface {
  Headers: { authorization?: string };
  user: { id: string; username: string };
}

export interface GetUserByUsernameRequest extends RouteGenericInterface {
  Params: { username: string };
  Headers: { authorization?: string };
  user: { id: string; username: string };
}

export interface UpdatePasswordRequest extends RouteGenericInterface {
  Body: { oldPassword: string; newPassword: string };
  Headers: { authorization?: string };
  user: { id: string; username: string };
}

export interface UpdateProfileRequest extends RouteGenericInterface {
  Body: { username?: string; email?: string; walletAddress?: string; avatar?: string };
  Headers: { authorization?: string };
  user: { id: string; username: string };
}

export interface GoogleCallbackRequest extends RouteGenericInterface {
  Querystring: { code: string; state: string };
}

export interface CompleteGoogleLoginRequest extends RouteGenericInterface {
  Body: { tempToken: string; username: string };
}

export interface CheckAuthTypeRequest extends RouteGenericInterface {
  Body: { email: string };
}

export interface VerifyResetCodeRequest extends RouteGenericInterface {
  Body: { email: string; resetCode: string };
}

export default async function (fastify: FastifyInstance) {
  const usersController = new UsersController(fastify);

  fastify.post('/register', usersController.register.bind(usersController));
  fastify.post('/login', usersController.login.bind(usersController));
  fastify.post('/request-reset', usersController.requestPasswordReset.bind(usersController));
  fastify.post('/reset-password', usersController.resetPassword.bind(usersController));
  fastify.post('/verify-reset-code', usersController.verifyResetCode.bind(usersController));
  fastify.get<GoogleCallbackRequest>('/google-callback', usersController.googleCallback.bind(usersController));
  fastify.post<CompleteGoogleLoginRequest>('/complete-google-login', usersController.completeGoogleLogin.bind(usersController));
  fastify.post<CheckAuthTypeRequest>('/check-auth-type', usersController.checkAuthType.bind(usersController));

  fastify.get('/profile', { preHandler: authMiddleware }, usersController.getProfile.bind(usersController));
  fastify.get<GetUserByUsernameRequest>('/profile/:username', { preHandler: authMiddleware }, usersController.getUserByUsername.bind(usersController));
  fastify.put<UpdatePasswordRequest>('/update-password', { preHandler: authMiddleware }, usersController.updatePassword.bind(usersController));
  fastify.put<UpdateProfileRequest>('/profile', { preHandler: authMiddleware }, usersController.updateProfile.bind(usersController));
}