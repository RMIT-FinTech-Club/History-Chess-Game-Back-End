import Fastify, { FastifyInstance } from 'fastify';
import { postgresPrisma } from './src/configs/prismaClient';
import * as dotenv from 'dotenv';

dotenv.config();

const fastify: FastifyInstance = Fastify({ logger: true });

fastify.register(require('@fastify/cors'), {
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

fastify.register(require('@fastify/multipart'));

fastify.register(require('@fastify/oauth2'), {
  name: 'googleOAuth2',
  scope: ['profile', 'email'],
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID!,
      secret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    auth: require('@fastify/oauth2').GOOGLE_CONFIGURATION,
  },
  startRedirectPath: '/users/google-auth',
  callbackUri: 'http://localhost:8080/users/google-callback',
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