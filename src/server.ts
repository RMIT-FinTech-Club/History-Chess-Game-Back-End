// backend/manual-realtime-server.ts (TypeScript with ES Modules)
import Fastify from 'fastify';
import { Server as SocketIOServer, Socket } from 'socket.io';
import * as GameController from "./controllers/game.controller"
import fastifyCors from '@fastify/cors';

const server = Fastify({
    logger: true // Optional: Enable Fastify logger for debugging
});

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

    io.on('connection', (socket: Socket) => {
        server.log.info(`Socket connected: ${socket.id}`);

        socket.on('joinGame', () => {
            GameController.handleJoinGame(socket, io); // Call controller function
        });

        socket.on('disconnect', (reason: string) => {
            GameController.handleDisconnect(socket, reason); // Call controller function
        });

        socket.emit('welcomeMessage', 'Welcome to the Chess Game Realtime Server (Modular - Functions)!'); // Updated message
    });
});

server.get('/', async (request, reply) => {
    return { hello: 'world from Fastify + Manual Socket.IO (TypeScript ESM)!' };
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