import fp from 'fastify-plugin'
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { Server as SocketIOServer } from 'socket.io';
import { handleSocketConnection } from '../services/socket.service';

const websocketPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    await fastify.register(fastifyWebsocket, {
        options: { maxPayload: 1048576 },
    })

    const io: SocketIOServer = new SocketIOServer(fastify.server, {
        cors: {
            origin: ["http://localhost:3000", "https://history-chess-game-front-end.vercel.app"],
            methods: ["GET", "POST", "PUT", "DELETE"],
            credentials: true
        },

        pingTimeout: 10000, // Further reduced to 10s
        pingInterval: 5000, // Reduced to 5s
        connectTimeout: 5000, // Reduced to 5s
    });

    io.on('connection', (socket) => handleSocketConnection(socket, io, fastify))
})

export default websocketPlugin