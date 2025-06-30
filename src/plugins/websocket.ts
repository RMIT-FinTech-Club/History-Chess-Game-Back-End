import fp from 'fastify-plugin'
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { Server as SocketIOServer } from 'socket.io';
import { handleSocketConnection } from '../services/socket.service';
import uiBasePath from '../types/uiPathConfig';

const websocketPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    await fastify.register(fastifyWebsocket, {
        options: {
            maxPayload: 1048576, // 1MB
            clientTracking: true,
        },
    });

    const io: SocketIOServer = new SocketIOServer(fastify.server, {
        cors: {
            origin: uiBasePath,
            methods: ["GET", "POST", "PUT", "DELETE"],
            allowedHeaders: ['Content-Type', 'Authorization'],
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
        headers["Access-Control-Allow-Origin"] = uiBasePath;
        headers["Access-Control-Allow-Credentials"] = "true";
    });

    io.on('connection', (socket) => handleSocketConnection(socket, io, fastify));
});

export default websocketPlugin