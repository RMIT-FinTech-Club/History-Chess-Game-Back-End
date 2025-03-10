import { MongoClient } from 'mongodb';
import { Pool } from '@neondatabase/serverless';

declare module 'fastify' {
    interface FastifyInstance {
        mongo: {
            client: MongoClient;
            db: any;
        };
        neon: Pool;
    }
}