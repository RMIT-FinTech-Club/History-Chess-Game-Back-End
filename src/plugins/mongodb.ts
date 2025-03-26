import fastifyPlugin from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { MongoClient } from 'mongodb';
import { dbConfig } from '../configs/db';

async function mongoPlugin(fastify: FastifyInstance) {
  const client = new MongoClient(dbConfig.mongo.url);
  await client.connect();
  const db = client.db(dbConfig.mongo.dbName);

  fastify.decorate('mongo', { client, db });
  fastify.log.info('MongoDB connected successfully');

  fastify.addHook('onClose', async () => {
    await client.close();
    fastify.log.info('MongoDB connection closed');
  });
}

export default fastifyPlugin(mongoPlugin);