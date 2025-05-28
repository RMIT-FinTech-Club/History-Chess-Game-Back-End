import fp from 'fastify-plugin'
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { Server as SocketIOServer } from 'socket.io';
import { handleSocketConnection } from '../services/socket.service';

const websocketPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    await fastify.register(fastifyWebsocket)

    const io: SocketIOServer = new SocketIOServer(fastify.server, {
        cors: {
            origin: "http://localhost:3000",
            methods: ["GET", "POST", "PUT", "DELETE"]
        },

        pingTimeout: 60000, 
        pingInterval: 25000, 
        connectTimeout: 45000,
       
    });

    io.on('connection', (socket) => handleSocketConnection(socket, io, fastify))
})

export default websocketPlugin