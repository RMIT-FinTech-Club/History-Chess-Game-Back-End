import * as dotenv from 'dotenv';
dotenv.config();

import dns from 'node:dns';
// Fix for Node.js SRV lookup issues on some machines
dns.setServers(['8.8.8.8', '8.8.4.4']);

import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyOAuth2 from '@fastify/oauth2';
import fastifyMultipart from '@fastify/multipart';
import { postgresPrisma } from './configs/prismaClient';
import neonPlugin from './plugins/neon';
import mongodbPlugin from './plugins/mongodb';
import websocketPlugin from './plugins/websocket';
import prismaPlugin from './plugins/prisma';
import walletRoutes from './routes/wallet.routes';
import userRoutes from './routes/user.routes';
import gameRoutes from './routes/game.routes';
import marketRoutes from './routes/market.routes';
import questRoutes from './routes/quest.routes';
import { PrismaClient } from '@prisma/client';
import basePath from './types/pathConfig.ts';
import { initializeRabbitMQ, getRabbitMQ } from './configs/rabbitmq.ts';

import { config } from './configs/unifiedConfig';
import { CompositionRoot } from './configs/compositionRoot';

const port = config.port;

const server: FastifyInstance = Fastify({ logger: true });

// Register CORS
server.register(fastifyCors, {
  origin: ['http://localhost:3000', "https://history-chess-game-front-end.onrender.com"],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// Register JWT
server.register(fastifyJwt, {
  secret: config.jwt.secret,
});

// Registered OAuth2 for Google is handled via manual routes in userRoutes

// Register multipart for file uploads
server.register(fastifyMultipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Register Swagger
server.register(import('@fastify/swagger'), {
  swagger: {
    info: {
      title: 'Vietnamese History Chess Game API',
      description: 'API documentation for the Chess Game backend service',
      version: '1.0.0',
    },
    externalDocs: {
      url: 'https://github.com/your-repo/History-Chess-Game-Back-End',
      description: 'The remote repo for backend',
    },
    host: 'localhost:8080',
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { name: 'game', description: 'Game related endpoints' },
      { name: 'user', description: 'User profile related endpoints' },
      { name: 'socket', description: 'Socket.IO events documentation' },
    ],
    securityDefinitions: {
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
      },
    },
  },
});

// Register Swagger UI
server.register(import('@fastify/swagger-ui'), {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
  uiHooks: {
    onRequest: function (_request, _reply, next) { next(); },
    preHandler: function (request, reply, next) { next(); },
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

// Register plugins
server.register(mongodbPlugin);
server.register(neonPlugin);
server.register(websocketPlugin);
server.register(prismaPlugin);


server.ready(() => {
  server.log.info('Server is ready!');
  server.log.info('All registered routes:');
  server.log.info(server.printRoutes());
});

// Root route
server.get('/', async (request, reply) => {
  return { 
    hello: 'world from Fastify + Manual Socket.IO (TypeScript ESM)!',
    rabbitmq: getRabbitMQ().isConnected() ? 'connected' : 'disconnected'
  };
});

// ✅ NEW: Health check with RabbitMQ status
server.get('/health', async (request, reply) => {
  try {
    await (server.neon as unknown as { query: (sql: string) => Promise<unknown> }).query('SELECT 1');
    
    const rabbitmq = getRabbitMQ();
    const rabbitmqStatus = rabbitmq.getStatus();
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: 'connected',
        neon: 'connected',
        rabbitmq: rabbitmqStatus.connected ? 'connected' : 'disconnected',
      },
      rabbitmq: {
        connected: rabbitmqStatus.connected,
        reconnectAttempts: rabbitmqStatus.reconnectAttempts,
        queues: rabbitmqStatus.config.queues
      }
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    reply.status(500).send({
      status: 'error',
      message: message,
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
});

// ✅ NEW: RabbitMQ queue status endpoint
server.get('/queue-status', async (request, reply) => {
  try {
    const rabbitmq = getRabbitMQ();
    
    if (!rabbitmq.isConnected()) {
      return reply.status(503).send({
        status: 'error',
        message: 'RabbitMQ not connected'
      });
    }
    
    const channel = rabbitmq.getChannel();
    const queues = rabbitmq.getQueues();
    
    // Get queue stats
    const mainQueueInfo = await channel.checkQueue(queues.rewardQueue);
    const dlqInfo = await channel.checkQueue(queues.rewardDLQ);
    
    return {
      status: 'ok',
      queues: {
        main: {
          name: queues.rewardQueue,
          messages: mainQueueInfo.messageCount,
          consumers: mainQueueInfo.consumerCount
        },
        dlq: {
          name: queues.rewardDLQ,
          messages: dlqInfo.messageCount,
          consumers: dlqInfo.consumerCount
        }
      }
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return reply.status(500).send({
      status: 'error',
      message: message
    });
  }
});

// ✅ NEW: Start function with RabbitMQ initialization
const start = async () => {
  try {
    // 1. Connect to PostgreSQL (NeonDB)
    await postgresPrisma.$connect();
    server.log.info('✅ Connected to NeonDB via Prisma');

    // 2. Initialize RabbitMQ
    server.log.info('🔌 Initializing RabbitMQ...');
    await initializeRabbitMQ();
    server.log.info('✅ RabbitMQ initialized successfully');

    // 3. Initialize Composition Root (DI)
    CompositionRoot.initialize(server, postgresPrisma);
    server.log.info('✅ Composition Root initialized');

    // 4. Register Routes (After DI)
    server.register(userRoutes);
    server.register(gameRoutes, { prefix: '/game' });
    server.register(walletRoutes);
    server.register(marketRoutes);
    server.register(questRoutes);

    // 4. Start Fastify server
    await server.listen({ port: port, host: '0.0.0.0' });
    server.log.info(`🚀 Server running on ${basePath}`);
    
    // 4. Log startup summary
    server.log.info('\n' + '='.repeat(60));
    server.log.info('📊 SERVICE STATUS');
    server.log.info('='.repeat(60));
    server.log.info(`✅ HTTP Server: ${basePath}`);
    server.log.info(`✅ PostgreSQL (NeonDB): Connected`);
    server.log.info(`✅ MongoDB: Connected`);
    server.log.info(`✅ RabbitMQ: Connected`);
    server.log.info(`✅ WebSocket: Ready`);
    server.log.info('='.repeat(60) + '\n');

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    server.log.error(`❌ Server startup failed: ${errorMessage}`);
    if (err instanceof Error && err.stack) {
      server.log.error(err.stack);
    }
    process.exit(1);
  }
};

// ✅ NEW: Graceful shutdown with RabbitMQ cleanup
server.addHook('onClose', async () => {
  server.log.info('🔄 Shutting down server...');
  
  try {
    // Close RabbitMQ connection
    const rabbitmq = getRabbitMQ();
    await rabbitmq.close();
    server.log.info('✅ RabbitMQ connection closed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    server.log.error(`❌ Error closing RabbitMQ: ${errorMessage}`);
  }
  
  try {
    // Close Prisma connection
    await postgresPrisma.$disconnect();
    server.log.info('✅ Prisma connection closed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    server.log.error(`❌ Error closing Prisma: ${errorMessage}`);
  }
  
  server.log.info('👋 Server shutdown complete');
});

// Handle process termination signals
process.on('SIGINT', async () => {
  server.log.info('⚠️  SIGINT received, shutting down gracefully...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.log.info('⚠️  SIGTERM received, shutting down gracefully...');
  await server.close();
  process.exit(0);
});

// Start the server
start();

// Extend Fastify instance interface
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}