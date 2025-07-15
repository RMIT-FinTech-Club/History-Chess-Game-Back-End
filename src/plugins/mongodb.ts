import fp from 'fastify-plugin';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose, { Mongoose } from 'mongoose';
import { dbConfig } from '../configs/db';

interface MongoDBPlugin {
    mongoose: Mongoose; // Keep this for type hinting
}

const mongodbPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    try {
        // Connect with MongoDB using Mongoose
        await mongoose.connect(dbConfig.mongodb.url, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            dbName: dbConfig.mongodb.database, // Specify the database name here
        });

        // Decorate the Fastify instance with the Mongoose connection
        fastify.decorate('mongo', mongoose);

        // Add a hook to close the Mongoose connection on Fastify server close
        fastify.addHook('onClose', async (instance) => {
            await (instance as FastifyInstance & { mongo: MongoDBPlugin }).mongo.mongoose.connection.close();
        });

        fastify.log.info('MongoDB connected successfully with Mongoose');
    } catch (error: unknown) {
        fastify.log.error('MongoDB connection failed with Mongoose:', error);
        if (error instanceof Error) {
            throw new Error(`Failed to connect to MongoDB with Mongoose: ${error.message}`);
        } else {
            throw new Error('Failed to connect to MongoDB with Mongoose due to an unknown error');
        }
    }
}, {
    name: 'mongodb',
    fastify: '5.x'
});

export default mongodbPlugin;