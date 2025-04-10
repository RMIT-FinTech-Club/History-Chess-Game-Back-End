import { MongoClient } from 'mongodb';
import { Pool } from '@neondatabase/serverless';
import { PrismaClient } from '@prisma/client/edge';
import mongoose from 'mongoose';

declare module 'fastify' {
    interface FastifyInstance {
        mongo: typeof mongoose;
        neon: Pool;
        prisma: PrismaClient;
    }
}