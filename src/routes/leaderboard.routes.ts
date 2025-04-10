import { FastifyInstance } from 'fastify';
import { leaderboardController } from '../controllers/leaderboard.controller';
import { getLeaderboardSchema } from './schemas/leaderboardSchema';

export default async function leaderboardRoutes(fastify: FastifyInstance) {
    fastify.get('/leaderboard', {
        schema: getLeaderboardSchema,
        handler: leaderboardController.getLeaderboard,
    });
}