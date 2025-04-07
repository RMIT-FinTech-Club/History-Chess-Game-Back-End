import fastify, { FastifyPluginAsync } from "fastify";
import { challengeUser, createNewGame, findNewMatch, getUserGameHistory, getGameMoves } from "../controllers/game.controller";

const gameRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/new', createNewGame);
    fastify.post('/find', findNewMatch);
    fastify.post('/challenge', challengeUser);
    fastify.get('/history/:userId', getUserGameHistory);
    fastify.get('/history/detail/:gameId', getGameMoves);   
}

export default gameRoutes;