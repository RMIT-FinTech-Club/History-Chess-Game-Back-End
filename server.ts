import Fastify, { FastifyInstance } from 'fastify';
import { postgresPrisma } from './src/configs/prismaClient';
import * as dotenv from 'dotenv';

dotenv.config();

const fastify: FastifyInstance = Fastify({ logger: true });

fastify.register(require('./src/plugins/mongodb'));
fastify.register(require('./src/plugins/neon'));
fastify.decorate('prisma', postgresPrisma);
fastify.register(require('./src/routes/users.router'), { prefix: '/users' });

const start = async (): Promise<void> => {
  try {
    await postgresPrisma.$connect();
    fastify.log.info('Connected to NeonDB via Prisma');
    await fastify.listen({ port: 3000 });
    fastify.log.info('Server running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

fastify.addHook('onClose', async () => {
  await postgresPrisma.$disconnect();
  fastify.log.info('Prisma connection closed');
});

start();