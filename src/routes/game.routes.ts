import fastify, { FastifyPluginAsync } from "fastify";
import { challengeUser, findNewMatch } from "../controllers/game.controller";

const gameRoutes: FastifyPluginAsync = async (fastify) => {
    // fastify.post('/api/v1/game/new', createNewGame);
    fastify.post('/find', findNewMatch);
    fastify.post('/challenge', challengeUser);
}

export default gameRoutes;