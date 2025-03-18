// backend/manual-realtime-server.ts (TypeScript with ES Modules)
import Fastify from 'fastify';
import { Server as SocketIOServer, Socket } from 'socket.io';
import * as GameController from "./controllers/game.controller"
import * as GameService from "./services/game.service";
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





