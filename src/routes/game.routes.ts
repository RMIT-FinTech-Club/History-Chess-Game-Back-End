import fastify, { FastifyPluginAsync } from "fastify";
import { createNewGame, findNewMatch } from "../controllers/game.controller";

const gameRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/new', createNewGame);
    fastify.post('/find', findNewMatch);
}

export default gameRoutes;