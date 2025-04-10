import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import neonPlugin from './plugins/neon';
import mongodbPlugin from './plugins/mongodb';
import prismaPlugin from './plugins/prisma';
import leaderboardRoutes from './routes/leaderboard.routes';

const server = Fastify({
    logger: true // Optional: Enable Fastify logger for debugging
});

server.register(mongodbPlugin)
server.register(neonPlugin)
server.register(prismaPlugin)
server.register(leaderboardRoutes, { prefix: '/api' });

server.register(fastifyCors, {
    origin: "http://localhost:3000", // Allow requests from your React frontend origin
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],         // Allowed HTTP methods
    credentials: true,
})

server.get('/', async (request, reply) => {
    return { hello: 'world from Fastify + Manual Socket.IO (TypeScript ESM)!' };
});

// Check connection with MongoDB and Neon check route
server.get('/health', async (request, reply) => {
    try {
        // Test MongoDB connection
        // await server.mongo.connect.command({ ping: 2 });
        
        // Test Neon connection
        await server.neon.query('SELECT 1');
        
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
        await server.listen({ port: 8000 });
        server.log.info(`Server listening on port ${8000}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();