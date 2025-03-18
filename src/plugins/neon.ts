import fp from 'fastify-plugin';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { dbConfig } from '../configs/db';
import { Pool, PoolClient } from 'pg';

interface NeonPlugin {
  pool: Pool;
}

const neonPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
  const connectionString = dbConfig.neon.url;

  if (!connectionString) {
    throw new Error('Neon PostgreSQL connection string is missing.');
  }

  let pool: Pool | null = null;
  let neonClient: PoolClient | null = null;

  try {
    pool = new Pool({ connectionString });
    neonClient = await pool.connect();
    fastify.log.info('Neon PostgreSQL plugin connected');

    fastify.decorate('neon', pool as NeonPlugin['pool']);

    fastify.addHook('onClose', async () => {
      if (neonClient) {
        neonClient.release();
      }
      if (pool) {
        await pool.end();
        console.log('Neon PostgreSQL connection pool closed');
      }
    });
  } catch (error: any) {
    fastify.log.error('Neon connection failed:', error);
    if (neonClient) {
      neonClient.release();
    }
    if (pool) {
      await pool.end();
    }
    throw new Error(`Failed to connect to Neon: ${error.message}`);
  }
}, {
  name: 'neon',
  fastify: '4.x'
});

export default neonPlugin;