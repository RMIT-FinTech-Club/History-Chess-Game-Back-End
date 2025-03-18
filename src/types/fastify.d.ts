import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    mongo: {
      client: MongoClient;
      db: ReturnType<MongoClient['db']>;
    };
    neon: Pool;
  }
}