import Fastify, { FastifyInstance } from 'fastify';
import { postgresPrisma } from './src/configs/prismaClient';
import * as dotenv from 'dotenv';

dotenv.config();

const fastify: FastifyInstance = Fastify({ logger: true });

// Register plugins
fastify.register(require('./src/plugins/mongodb'));
fastify.register(require('./src/plugins/neon'));

// Decorate with Prisma
fastify.decorate('prisma', postgresPrisma);

// Test database connections
async function connectToDatabases(): Promise<void> {
  try {
    await fastify.mongo.client.connect();
    await fastify.neon.connect();
    await postgresPrisma.$connect();
    fastify.log.info('Connected to MongoDB, NeonDB, and Prisma');
  } catch (error) {
    fastify.log.error('Database connection error:', error);
    process.exit(1);
  }
}

// Register routes
fastify.register(require('./src/routes/users.router'), { prefix: '/users' });

// Start server
const start = async (): Promise<void> => {
  await connectToDatabases();
  try {
    await fastify.listen({ port: 3000 });
    fastify.log.info('Server running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Cleanup on shutdown
fastify.addHook('onClose', async () => {
  await postgresPrisma.$disconnect();
  fastify.log.info('Prisma connection closed');
});

start();