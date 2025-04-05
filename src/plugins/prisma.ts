import fp from 'fastify-plugin'
import fastify, { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client'

const prismaPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
    const prisma = new PrismaClient()

    fastify.decorate('prisma', prisma)

    fastify.addHook('onClose', async (instance) => {
        await prisma.$disconnect()
    })
}, {
    name: 'prisma',
    fastify: '5.x'
}
)

export default prismaPlugin