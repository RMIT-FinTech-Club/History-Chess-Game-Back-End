import { FastifyInstance } from 'fastify';
import { QuestController } from '../controllers/quest.controller.ts';
import { authenticate } from '../middleware/auth.ts';

export default async function questRoutes(fastify: FastifyInstance) {
    const questController = new QuestController();

    // Dynasty Routes
    fastify.get('/dynasty/all', async (req, reply) => questController.getAllDynasties(req, reply));
    fastify.get('/dynasty/progress', { preHandler: [authenticate] }, async (req, reply) => questController.getUserProgress(req, reply));
    fastify.get('/dynasty/skins', { preHandler: [authenticate] }, async (req, reply) => questController.getSkins(req, reply));

    // Achievement Routes
    fastify.get('/achievements', { preHandler: [authenticate] }, async (req, reply) => questController.getAchievements(req, reply));
    fastify.post('/achievements/progress', { preHandler: [authenticate] }, async (req, reply) => questController.updateAchievementProgress(req, reply));
}
