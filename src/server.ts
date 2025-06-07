// backend/manual-realtime-server.ts (TypeScript with ES Modules)
import Fastify, { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { Server as SocketIOServer, Socket } from 'socket.io';
import * as GameController from "./controllers/game.controller"
import * as GameService from "./services/game.service";
import fastifyCors from '@fastify/cors';
import neonPlugin from './plugins/neon';
import mongodbPlugin from './plugins/mongodb';
import websocketPlugin from './plugins/websocket';
import prismaPlugin from './plugins/prisma';
import gameRoutes from './routes/game.routes';
import userRoutes from './routes/user.routes';

const server = Fastify({
    logger: true // Optional: Enable Fastify logger for debugging
});

// Register Swagger plugins first
server.register(import('@fastify/swagger'), {
    swagger: {
        info: {
            title: 'Vietnamese History Chess Game API',
            description: 'API documentation for the Chess Game backend service',
            version: '1.0.0'
        },
        externalDocs: {
            url: 'https://github.com/your-repo/History-Chess-Game-Back-End',
            description: 'The remote repo for backend'
        },
        host: 'localhost:8000',
        schemes: ['http'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
            { name: 'game', description: 'Game related endpoints' },
            { name: 'user', description: 'User profile related endpoints' },
            {name: 'socket', description: 'Socket.IO events documentation'}
        ],
        securityDefinitions: {
            bearerAuth: {
                type: 'apiKey',
                name: 'Authorization',
                in: 'header'
            }
        },
    }
});

server.register(fastifyMultipart, {
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB file size limit
    }
});

// Register Swagger UI
server.register(import('@fastify/swagger-ui'), {
    routePrefix: '/documentation',
    uiConfig: {
        docExpansion: 'list',
        deepLinking: true
    },
    uiHooks: {
        onRequest: function(request, reply, next){ next(); },
        preHandler: function(request, reply, next){ next(); }
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
});

server.register(mongodbPlugin)
server.register(neonPlugin)
server.register(websocketPlugin)
server.register(prismaPlugin)
server.register(gameRoutes)
// server.register(userRoutes, { prefix: '/api' })
server.register(userRoutes)
console.log("User routes registered");

server.register(fastifyCors, {
    origin: "http://localhost:3000", // Allow requests from your React frontend origin
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],         // Allowed HTTP methods
    credentials: true,
})


let io: SocketIOServer; // Explicitly type 'io' as SocketIOServer

// server.ready(() => {
//     // Create Socket.IO server, passing Fastify's HTTP server
//     io = new SocketIOServer(server.server, {
//         // Socket.IO options can be configured here if needed
//     });

//     io.on('connection', (socket: Socket) => { // Explicitly type 'socket' as Socket
//         server.log.info(`Socket connected: ${socket.id}`);

//         socket.on('messageFromClient', (data: string) => { // Type 'data' as string
//             server.log.info(`Received message from client ${socket.id}: ${data}`);

//             io.emit('messageFromServer', {
//                 senderId: socket.id,
//                 message: `Server received (manual - TypeScript ESM): ${data}`
//             });
//         });

//         socket.on('disconnect', (reason: string) => { // Type 'reason' as string
//             server.log.info(`Socket disconnected: ${socket.id} due to ${reason}`);
//         });

//         socket.emit('welcomeMessage', 'Welcome to the Chess Game Realtime Server (Manual - TypeScript ESM)!');
//     });
// });

server.ready(() => {
    io = new SocketIOServer(server.server, {
        cors: {
            origin: "http://localhost:3000",
            methods: ["GET", "POST", "PUT", "DELETE"]
        }
    });

    console.log("Server is ready!");
    console.log("All registered routes:");
    console.log(server.printRoutes());
    
    // Set up matching check
    const matchmakingInterval = setInterval(() => {
        if (io) {
            GameService.checkWaitingPlayersForMatches(io);
        }
    }, 1000);
    
    io.on('connection', (socket: Socket) => {
        server.log.info(`Socket connected: ${socket.id}`);
        
        socket.on('joinGame', (data: { elo: number }) => {
            server.log.info(`\nPlayer ${socket.id} requesting to join game with data: ${JSON.stringify(data)}`);
            const playerElo = data.elo || 1200;
            GameController.handleJoinGame(socket, io, playerElo);
        });
        
        socket.on('disconnect', (reason: string) => {
            server.log.info(`Socket disconnected: ${socket.id} due to ${reason}`);
            GameController.handleDisconnect(socket, reason);
        });
        
        socket.emit('welcomeMessage', 'Welcome to the Chess Game Realtime Server!');
        
        
        socket.on('makeMove', (data: { gameId: string, move: string }) => {
            GameService.handleMove(socket, io, data.gameId, data.move);
        });
    });
});

server.get('/', async (request, reply) => {
    return { hello: 'world from Fastify + Manual Socket.IO (TypeScript ESM)!' };
});

// Check connection with MongoDB and Neon check route
server.get('/health', async (request, reply) => {
    try {
        // Test MongoDB connection
        // await server.mongo.connect.command({ ping: 2 });
        
        // Test Neon connection
        await (server as any).neon.query('SELECT 1');
        
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





