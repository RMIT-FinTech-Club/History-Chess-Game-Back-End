import fp from 'fastify-plugin';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { MongoClient } from 'mongodb';
import { dbConfig } from '../configs/db';

interface MongoDBPlugin {
    client: MongoClient;
    db: ReturnType<MongoClient['db']>;
}

const mongodbPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    try {
        // Connect with MongoDB
        const client = new MongoClient(dbConfig.mongodb.url, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000
        });

        await client.connect();
        const db = client.db(dbConfig.mongodb.database);

        // Test connection
        await db.command({ ping: 1 });

        // Decorate the pool so that Fastify Instance can use
        fastify.decorate('mongo', {
            client,
            db
        });

        fastify.addHook('onClose', async (instance) => {
            await (instance as FastifyInstance & { mongo: MongoDBPlugin }).mongo.client.close();
        });

        fastify.log.info('MongoDB connected successfully');
    } catch (error: any) {
        fastify.log.error('MongoDB connection failed:', error);
        throw new Error(`Failed to connect to MongoDB: ${error.message}`);
    }
}, {
    name: 'mongodb',
    fastify: '5.x'
});

export default mongodbPlugin;