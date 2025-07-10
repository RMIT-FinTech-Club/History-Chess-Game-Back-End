import { FastifyPluginAsync } from "fastify";
import { createNewGame, findNewMatch, getGameHistory, getGameMoves, getGameAnalysis } from "../controllers/game.controller";
//import { stockfishService } from "../services/stockfish.service";
import { authenticate } from "../middleware/auth";


const gameRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/new', createNewGame);
    fastify.post('/find', findNewMatch);
    fastify.get('/history/:userId', {preHandler: authenticate}, getGameHistory);
    fastify.get('/history/detail/:gameId', {preHandler: authenticate}, getGameMoves);
    fastify.get('/analysis/:gameId', {preHandler: authenticate}, getGameAnalysis);
}

export default gameRoutes;