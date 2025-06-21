import fp from 'fastify-plugin'
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { Server as SocketIOServer } from 'socket.io';
import { handleSocketConnection } from '../services/socket.service';

const websocketPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    await fastify.register(fastifyWebsocket, {
        options: {
            maxPayload: 1048576, // 1MB
            clientTracking: true,
        },
    });

    const io: SocketIOServer = new SocketIOServer(fastify.server, {
        cors: {
            origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
            methods: ["GET", "POST", "PUT", "DELETE"],
            credentials: true
        },
        path: "/socket.io/",
        transports: ["websocket", "polling"],
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000,
        connectTimeout: 45000,
    });

    // Set up CORS for HTTP handshake
    io.engine.on("headers", (headers, request) => {
        headers["Access-Control-Allow-Origin"] = "http://localhost:3000";
        headers["Access-Control-Allow-Credentials"] = "true";
    });

    io.on('connection', (socket) => handleSocketConnection(socket, io, fastify));
});

export default websocketPlugin