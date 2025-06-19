import fastify, { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createNewGame, findNewMatch, getGameHistory, getGameMoves, getGameAnalysis } from "../controllers/game.controller";
import { stockfishService } from "../services/stockfish.service";
import { authMiddleware } from "../middleware/auth";

const preHandler = { preHandler: authMiddleware };

const gameRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/new', createNewGame);
    fastify.post('/find', findNewMatch);
    fastify.get('/history/:userId', preHandler, getGameHistory);
    fastify.get('/history/detail/:gameId', preHandler, getGameMoves);
    fastify.get('/analysis/:gameId', preHandler, getGameAnalysis);
    
    // Analysis routes
    // fastify.get('/analysis/test', async (request: FastifyRequest, reply: FastifyReply) => {
    //     try {
    //         const isConnected = await stockfishService.testConnection();
    //         const stats = stockfishService.getUsageStats();
            
    //         reply.send({ 
    //             success: true, 
    //             connected: isConnected,
    //             stats: stats
    //         });
    //     } catch (error) {
    //         reply.status(500).send({ 
    //             success: false, 
    //             error: 'Connection test failed' 
    //         });
    //     }
    // });

    // fastify.post('/analysis/position', async (request: FastifyRequest<{ Body: { fen: string; depth?: number } }>, reply: FastifyReply) => {
    //     try {
    //         const { fen, depth = 12 } = request.body;
    //         console.log('Analyzing position:', fen, 'with depth:', depth);
    //         if (!fen) {
    //             reply.status(400).send({ success: false, error: 'FEN position required' });
    //             return;
    //         }

    //         const analysis = await stockfishService.analyzePosition(fen, depth);
    //         reply.send({ success: true, data: analysis });
    //     } catch (error: any) {
    //         reply.status(500).send({ 
    //             success: false, 
    //             error: 'Position analysis failed' 
    //         });
    //     }
    // });
}

export default gameRoutes;