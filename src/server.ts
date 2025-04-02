// backend/manual-realtime-server.ts (TypeScript with ES Modules)
import Fastify, { FastifyInstance } from 'fastify';
import { Server as SocketIOServer, Socket } from 'socket.io';
import * as GameController from "./controllers/game.controller"
import * as GameService from "./services/game.service";
import * as SocketService from "./services/socket.service";


import fastifyCors from '@fastify/cors';
import neonPlugin from './plugins/neon';
import mongodbPlugin from './plugins/mongodb';
import websocketPlugin from './plugins/websocket';
import prismaPlugin from './plugins/prisma';
import gameRoutes from './routes/game.routes';

// const server = Fastify({
//     logger: true // Optional: Enable Fastify logger for debugging
// });

const server: FastifyInstance = Fastify({ logger: true });

// Register plugins
server.register(mongodbPlugin)
server.register(neonPlugin)
server.register(websocketPlugin) 
server.register(prismaPlugin)

// Register game routes with the correct prefix
server.register(gameRoutes, { prefix: '/game' })
// server.register(gameRoutes)


server.register(fastifyCors, {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
})

let io: SocketIOServer; // Explicitly type 'io' as SocketIOServer


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

// server.ready(() => {
//     io = new SocketIOServer(server.server, {
//         cors: {
//             origin: "http://localhost:3000",
//             methods: ["GET", "POST", "PUT", "DELETE"]
//         }
//     });

//     // Make socket.io instance available to routes
//     server.decorate('io', io);

//     const matchmakingInterval = setInterval(() => {
//         if (io) {
//             SocketService.checkWaitingPlayersForMatches(io);
//         }
//     }, 1000);

//     io.on('connection', (socket: Socket) => {
//         server.log.info(`Socket connected: ${socket.id}`);

//         // socket.on('joinGame', (data: { userId: string }) => {
//         //     server.log.info(`\nPlayer ${socket.id} requesting to join game with userId: ${data.userId}`);
//         //     GameController.handlefindMatch(socket, io, { 
//         //         userId: data.userId,
             
                
//         //     });
//         // });


//         socket.on('disconnect', (reason: string) => {
//             server.log.info(`Socket disconnected: ${socket.id} due to ${reason}`);
//             SocketService.handleDisconnect(socket, reason);
//         });

//         socket.emit('welcomeMessage', 'Welcome to the Chess Game Realtime Server!');


//         socket.on('makeMove', (data: { gameId: string, move: string }) => {
//             GameService.handleMove(socket, io, data.gameId, data.move);
//         });
//     });
// });

server.get('/', async (request, reply) => {
    return { hello: 'world from Fastify + Manual Socket.IO (TypeScript ESM)!' };
});

// Check connection with MongoDB and Neon check route
server.get('/health', async (request, reply) => {
    try {
        // Test MongoDB connection
        // await fastify.mongo.db.command({ ping: 2 });

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


