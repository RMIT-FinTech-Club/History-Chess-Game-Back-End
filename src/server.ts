// backend/manual-realtime-server.ts (TypeScript with ES Modules)
import Fastify from 'fastify';
import { Server as SocketIOServer, Socket } from 'socket.io'; // Import Socket.IO Server and Socket types

const server = Fastify({
    logger: true // Optional: Enable Fastify logger for debugging
});

let io: SocketIOServer; // Explicitly type 'io' as SocketIOServer

server.ready(() => {
    // Create Socket.IO server, passing Fastify's HTTP server
    io = new SocketIOServer(server.server, {
        // Socket.IO options can be configured here if needed
    });

    io.on('connection', (socket: Socket) => { // Explicitly type 'socket' as Socket
        server.log.info(`Socket connected: ${socket.id}`);

        socket.on('messageFromClient', (data: string) => { // Type 'data' as string
            server.log.info(`Received message from client ${socket.id}: ${data}`);

            io.emit('messageFromServer', {
                senderId: socket.id,
                message: `Server received (manual - TypeScript ESM): ${data}`
            });
        });

        socket.on('disconnect', (reason: string) => { // Type 'reason' as string
            server.log.info(`Socket disconnected: ${socket.id} due to ${reason}`);
        });

        socket.emit('welcomeMessage', 'Welcome to the Chess Game Realtime Server (Manual - TypeScript ESM)!');
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