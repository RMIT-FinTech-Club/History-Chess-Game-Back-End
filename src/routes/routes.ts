import { FastifyInstance } from 'fastify';
import userRoutes from './user.routes';
import authRoutes from './auth.routes';


export default async function routes(fastify: FastifyInstance) {
    // Register all route groups
    fastify.register(userRoutes, { prefix: '/api' });
    fastify.register(authRoutes, { prefix: '/api' });
    
    // Add a root route for API health check
    fastify.get('/api', async () => {
        return { status: 'ok', message: 'FTC Chess Game API' };
    });

}