import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const fastify: FastifyInstance = Fastify({ logger: true });

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'user_auth',
  password: 'your_password',
  port: 5432,
});

async function connectToPostgres(): Promise<void> {
  try {
    const client = await pool.connect();
    fastify.log.info('Connected to PostgreSQL');
    client.release();
  } catch (error) {
    fastify.log.error('PostgreSQL connection error:', error);
    process.exit(1);
  }
}

fastify.decorate('db', pool);

fastify.register(require('./src/routes/users.router'), { prefix: '/users' });

const start = async (): Promise<void> => {
  await connectToPostgres();
  try {
    await fastify.listen({ port: 3000 });
    console.log('Server running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

fastify.addHook('onClose', async () => {
  await pool.end();
  fastify.log.info('PostgreSQL connection closed');
});

start();