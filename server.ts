import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyOAuth2 from '@fastify/oauth2';
import fastifyMultipart from '@fastify/multipart';
import { postgresPrisma } from './src/configs/prismaClient';
import * as dotenv from 'dotenv';
import neonPlugin from './src/plugins/neon';
import userRoutes from './src/routes/users.router';

dotenv.config();

const fastify: FastifyInstance = Fastify({ logger: true });

fastify.register(fastifyCors, {
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'your-secret-key',
});

fastify.register(fastifyOAuth2, {
  name: 'googleOAuth2',
  scope: ['profile', 'email'],
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID!,
      secret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    auth: fastifyOAuth2.GOOGLE_CONFIGURATION,
  },
  startRedirectPath: '/users/google-auth',
  callbackUri: 'http://localhost:8080/users/google-callback',
});

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

fastify.register(neonPlugin);
fastify.decorate('prisma', { postgres: postgresPrisma });
fastify.register(userRoutes, { prefix: '/users' });

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