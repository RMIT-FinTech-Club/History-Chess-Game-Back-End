import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const fastify: FastifyInstance = Fastify({ logger: true });

// Initialize Prisma Client
const prisma = new PrismaClient();

// Test database connection
async function connectToDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    fastify.log.info('Connected to NeonDB/PostgreSQL via Prisma');
  } catch (error) {
    fastify.log.error('Database connection error:', error);
    process.exit(1);
  }
}

// Decorate Fastify with Prisma
fastify.decorate('prisma', prisma);

// Register routes
fastify.register(require('./src/routes/users.router'), { prefix: '/users' });

// Start server
const start = async (): Promise<void> => {
  await connectToDatabase();
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
  await prisma.$disconnect();
  fastify.log.info('Prisma connection closed');
});

start();