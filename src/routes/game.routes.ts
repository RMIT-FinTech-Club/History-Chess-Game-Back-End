import fastify, { FastifyPluginAsync } from "fastify";
import { challengeUser, createNewGame, findNewMatch } from "../controllers/game.controller";

const gameRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/api/v1/game/new', createNewGame);
    fastify.post('/api/v1/game/find', findNewMatch);
    fastify.post('/api/v1/game/challenge', challengeUser);
}

export default gameRoutes;