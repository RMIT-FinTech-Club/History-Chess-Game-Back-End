import fp from 'fastify-plugin'
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client'

declare module 'fastify' {
    interface FastifyInstance {
        prisma: PrismaClient;
    }
}

const prismaPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    const prisma = new PrismaClient()

    fastify.decorate('prisma', prisma)

    fastify.addHook('onClose', async (instance) => {
        await prisma.$disconnect();
        instance.log.info('Prisma connection disconnected');
    })
}, {
    name: 'prisma',
    fastify: '5.x'
}
)

export default prismaPlugin