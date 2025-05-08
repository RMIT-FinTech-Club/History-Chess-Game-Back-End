import Fastify, { FastifyInstance } from 'fastify';
import { postgresPrisma } from './src/configs/prismaClient';
import * as dotenv from 'dotenv';

dotenv.config();

const fastify: FastifyInstance = Fastify({ logger: true });

fastify.register(require('@fastify/cors'), {
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

fastify.register(require('./src/plugins/neon'));
fastify.decorate('prisma', { postgres: postgresPrisma });
fastify.register(require('./src/routes/users.router'), { prefix: '/users' });

const start = async (): Promise<void> => {
  try {
    fastify.log.info(`NEON_URL from env: ${process.env.NEON_URL}`);
    await postgresPrisma.$connect();
    fastify.log.info('Connected to NeonDB via Prisma');
    await fastify.listen({ port: parseInt(process.env.PORT || '8080'), host: '0.0.0.0' });
    fastify.log.info(`Server running on http://localhost:${process.env.PORT || '8080'}`);
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