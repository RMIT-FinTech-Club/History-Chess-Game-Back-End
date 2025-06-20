import fastify, { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createNewGame, findNewMatch, getGameHistory, getGameMoves, getGameAnalysis } from "../controllers/game.controller";
import { stockfishService } from "../services/stockfish.service";
import { authenticate } from "../middleware/auth";

const preHandler = { preHandler: authenticate };

const gameRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/new', createNewGame);
    fastify.post('/find', findNewMatch);
    fastify.get('/history/:userId', getGameHistory);
    fastify.get('/history/detail/:gameId', preHandler, getGameMoves);
    fastify.get('/analysis/:gameId', getGameAnalysis);
}

export default gameRoutes;