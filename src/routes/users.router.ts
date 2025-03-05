import { FastifyInstance } from 'fastify';
import UsersController from '../controllers/users.controller';

export default async function (fastify: FastifyInstance): Promise<void> {
  const usersController = new UsersController(fastify);

  fastify.post('/register', usersController.register.bind(usersController));
  fastify.post('/login', usersController.login.bind(usersController));
  fastify.get('/profile', usersController.getProfile.bind(usersController));
}