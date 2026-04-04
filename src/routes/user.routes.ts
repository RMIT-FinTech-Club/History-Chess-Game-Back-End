import { FastifyInstance } from 'fastify';
import { CompositionRoot } from '../configs/compositionRoot';
import { authenticate } from '../middleware/auth';
import { asyncErrorWrapper } from '../middleware/asyncErrorWrapper';

export default async function userRoutes(fastify: FastifyInstance) {
  const { userController } = CompositionRoot.getInstance();

  fastify.post('/users/login', asyncErrorWrapper(userController.login.bind(userController)));
  fastify.post('/users/signup', asyncErrorWrapper(userController.signup.bind(userController)));
  
  fastify.get('/users/me', { preHandler: authenticate }, asyncErrorWrapper(userController.getMe.bind(userController)));
  fastify.put('/users/profile', { preHandler: authenticate }, asyncErrorWrapper(userController.updateProfile.bind(userController)));

  // Google Auth routes
  fastify.get('/users/google-auth', asyncErrorWrapper(userController.googleAuth.bind(userController)));
  fastify.get('/users/google-callback', asyncErrorWrapper(userController.googleCallback.bind(userController)));
  fastify.post('/users/complete-google-login', asyncErrorWrapper(userController.completeGoogleLogin.bind(userController)));

  // Note: I've focused on the core routes first. 
  // Other routes from the original user.routes.ts can be added back 
  // after implementing their corresponding controller methods.
}