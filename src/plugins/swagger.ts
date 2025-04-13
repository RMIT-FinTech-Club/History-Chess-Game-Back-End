// Swagger Plugin for API Documentation

import fastifyPlugin from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger'; // for creating the OpenAPI/Swagger specification based on routes and schemas
import swaggerUI from '@fastify/swagger-ui';

export default fastifyPlugin(async (fastify: FastifyInstance) => {
    // Register the swagger schema generator
    await fastify.register(swagger, {
        swagger: {
            info: {
                title: 'History Chess Game API',
                description: 'API for the Vietnamese Historical Chess Game',
                version: '1.0.0',
            },
            externalDocs: {
                url: 'https://swagger.io',
                description: 'Find more info here',
            },
            host: 'localhost:8000',
            schemes: ['http'],
            consumes: ['application/json'], // content type that API can consume
            produces: ['application/json'], // content type that API produces
            tags: [
                { name: 'user', description: 'User related end-points' },
                { name: 'game', description: 'Game related end-points' },
                { name: 'nft', description: 'NFT related end-points' },
            ],
            securityDefinitions: {
                apiKey: {
                    type: 'apiKey',
                    name: 'apiKey',
                    in: 'header',
                },
            },
        },
    });
    
    // Register the swagger UI for the documentation
    await fastify.register(swaggerUI, {
        routePrefix: '/documentation',
        uiConfig: {
            docExpansion: 'list', // how the UI displays operations
            deepLinking: false, // if true, allows direct linking to operations
        },
        uiHooks: {
            // Lifecycle hooks
            onRequest: function (request, reply, next) {
                next();
            },
            preHandler: function (request, reply, next) {
                next();
            },
        },
        staticCSP: true,
        transformStaticCSP: (header) => header,
    });
});