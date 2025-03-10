import fp from 'fastify-plugin';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { dbConfig } from '../configs/db';
import { Pool, PoolClient } from 'pg';

const neonPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    const connectionString = dbConfig.neon.url;

    if (!connectionString) {
        throw new Error('Neon PostgreSQL connection string is missing. Please provide it in options or NEON_POSTGRESQL_URI environment variable.');
    }

    let pool: Pool | null = null;
    let neonClient: PoolClient | null = null;

    try {
        pool = new Pool({ connectionString });
        neonClient = await pool.connect(); // Get a client from the pool
        fastify.log.info('Neon PostgreSQL plugin connected');

        // Decorate the pool so that Fastify Instance can use
        fastify.decorate('neon', pool);

        fastify.addHook('onClose', async () => {
            if (neonClient) {
                neonClient.release(); // Release the client back to the pool on server close
            }
            if (pool) {
                await pool.end(); // Close the connection pool
                console.log('Neon PostgreSQL connection pool closed');
            }
        });
    } catch (error: any) {
        fastify.log.error('Neon connection failed:', error);
        if (neonClient) {
            neonClient.release(); // Release client on error if acquired
            neonClient = null;
        }
        if (pool) {
            await pool.end(); // Close pool on error
            pool = null;
        }
        throw new Error(`Failed to connect to Neon: ${error.message}`);
    }
}, {
    name: 'neon',
    fastify: '5.x'
});

export default neonPlugin;