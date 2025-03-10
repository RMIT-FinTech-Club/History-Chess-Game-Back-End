import Fastify, { FastifyInstance } from 'fastify';
import neonPlugin from './plugins/neon';
import mongodbPlugin from './plugins/mongodb';

const fastify: FastifyInstance = Fastify({ logger: true });

fastify.register(mongodbPlugin)
fastify.register(neonPlugin)

fastify.get('/', async (request, reply) => {
    return { hello: 'world' };
});

// Check connection with MongoDB and Neon check route
fastify.get('/health', async (request, reply) => {
    try {
        // Test MongoDB connection
        await fastify.mongo.db.command({ ping: 2 });

        // Test Neon connection
        await fastify.neon.query('SELECT 1');

        return {
            status: 'ok',
            mongodb: 'connected',
            neon: 'connected'
        };
    } catch (error: any) {
        reply.status(500).send({
            status: 'error',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error : undefined // Optionally include full error details in development
        });
    }
});

const start = async () => {
    try {
        await fastify.listen({ port: 8080 });
        console.log('Server is running at http://localhost:8080');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();