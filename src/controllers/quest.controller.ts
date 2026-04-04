import { FastifyRequest, FastifyReply } from 'fastify';
import { QuestService } from '../services/quest.service.ts';

export class QuestController {
    async getAllDynasties(request: FastifyRequest, reply: FastifyReply) {
        try {
            const dynasties = await QuestService.getAllDynasties();
            return reply.status(200).send({ success: true, data: { dynasties } });
        } catch (error: any) {
            return reply.status(500).send({ success: false, error: error.message });
        }
    }

    async getUserProgress(request: FastifyRequest | any, reply: FastifyReply) {
        try {
            const userId = request.authUser.id;
            const progress = await QuestService.getUserProgress(userId);
            return reply.status(200).send({ success: true, data: progress });
        } catch (error: any) {
            return reply.status(500).send({ success: false, error: error.message });
        }
    }

    async getSkins(request: FastifyRequest | any, reply: FastifyReply) {
        try {
            const userId = request.authUser.id;
            const skins = await QuestService.getSkins(userId);
            return reply.status(200).send({ success: true, data: skins });
        } catch (error: any) {
            return reply.status(500).send({ success: false, error: error.message });
        }
    }

    async getAchievements(request: FastifyRequest | any, reply: FastifyReply) {
        try {
            const userId = request.authUser.id;
            const achievements = await QuestService.getAchievements(userId);
            return reply.status(200).send({ success: true, data: achievements });
        } catch (error: any) {
            return reply.status(500).send({ success: false, error: error.message });
        }
    }

    async updateAchievementProgress(request: FastifyRequest | any, reply: FastifyReply) {
        try {
            const userId = request.authUser.id;
            const { achievementId, currentProgress, maxProgress } = request.body as { achievementId: string, currentProgress: number, maxProgress: number };
            const result = await QuestService.updateAchievementProgress(userId, achievementId, currentProgress, maxProgress);
            return reply.status(200).send({ success: true, data: result });
        } catch (error: any) {
            return reply.status(500).send({ success: false, error: error.message });
        }
    }
}
