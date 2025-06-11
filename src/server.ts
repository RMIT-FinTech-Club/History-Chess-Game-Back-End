import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyOAuth2 from '@fastify/oauth2';
import fastifyMultipart from '@fastify/multipart';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { postgresPrisma } from './configs/prismaClient';
import * as dotenv from 'dotenv';
import neonPlugin from './plugins/neon';
import mongodbPlugin from './plugins/mongodb';
import websocketPlugin from './plugins/websocket';
import prismaPlugin from './plugins/prisma';
import userRoutes from './routes/user.routes';
import gameRoutes from './routes/game.routes';
import * as GameController from './controllers/game.controller';
import * as GameService from './services/game.service';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const server: FastifyInstance = Fastify({ logger: true });

// Register CORS
server.register(fastifyCors, {
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// Register JWT
server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'your-secret-key',
});


// Register OAuth2 for Google
server.register(fastifyOAuth2, {
  name: 'googleOAuth2',
  scope: ['profile', 'email'],
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID!,
      secret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    auth: fastifyOAuth2.GOOGLE_CONFIGURATION,
  },
  startRedirectPath: '/users/google-auth',
  callbackUri: 'http://localhost:8080/users/google-callback',
});

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
    onRequest: function (request, reply, next) { next(); },
    preHandler: function (request, reply, next) { next(); },
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

// Register plugins
server.register(neonPlugin);
server.register(mongodbPlugin);
server.register(websocketPlugin);
server.register(prismaPlugin);

// Register routes
server.register(userRoutes);
server.register(gameRoutes);

let io: SocketIOServer;

server.ready(() => {
  io = new SocketIOServer(server.server, {
    cors: {
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  server.log.info('Server is ready!');
  server.log.info('All registered routes:');
  server.log.info(server.printRoutes());

  

  // io.on('connection', (socket: Socket) => {
  //   server.log.info(`Socket connected: ${socket.id}`);
    
  //   // Keep messageFromClient handler commented out but intact
  //   // socket.on('messageFromClient', (data: string) => {
  //   //   server.log.info(`Received message from client ${socket.id}: ${data}`);
  //   //   io.emit('messageFromServer', {
  //   //     senderId: socket.id,
  //   //     message: `Server received (manual - TypeScript ESM): ${data}`,
  //   //   });
  //   // });

  //   socket.on('joinGame', (data: { elo: number }) => {
  //     server.log.info(`\nPlayer ${socket.id} requesting to join game with data: ${JSON.stringify(data)}`);
  //     GameController.handleJoinGame(socket, io, data.elo || 1200);
  //   });

  //   socket.on('makeMove', (data: { gameId: string, move: string }) => {
  //     GameService.handleMove(socket, io, data.gameId, data.move);
  //   });

  //   socket.on('disconnect', (reason: string) => {
  //     server.log.info(`Socket disconnected: ${socket.id} due to ${reason}`);
  //     GameController.handleDisconnect(socket, reason);
  //   });

  //   socket.emit('welcomeMessage', 'Welcome to the Chess Game Realtime Server!');
  // });


  
});


server.get('/', async (request, reply) => {
  return { hello: 'world from Fastify + Manual Socket.IO (TypeScript ESM)!' };
});

server.get('/health', async (request, reply) => {
  try {
    await (server as any).neon.query('SELECT 1');
    return {
      status: 'ok',
      mongodb: 'connected',
      neon: 'connected',
    };
  } catch (error: any) {
    reply.status(500).send({
      status: 'error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
});

const start = async () => {
  try {
    await postgresPrisma.$connect();
    server.log.info('Connected to NeonDB via Prisma');
    await server.listen({ port: 8080, host: '0.0.0.0' });
    server.log.info(`Server running on http://localhost:8080`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

server.addHook('onClose', async () => {
  await postgresPrisma.$disconnect();
  server.log.info('Prisma connection closed');
});

start();

// Extend Fastify instance interface
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}