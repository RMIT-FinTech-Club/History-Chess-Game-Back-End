\import fastifyPlugin from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { dbConfig } from '../configs/db';

async function neonPlugin(fastify: FastifyInstance) {
  const pool = new Pool({ connectionString: dbConfig.neon.url });
  fastify.decorate('neon', pool);
  fastify.log.info('Neon PostgreSQL plugin connected');

  fastify.addHook('onClose', async () => {
    await pool.end();
    fastify.log.info('Neon pool closed');
  });
}

export default fastifyPlugin(neonPlugin);