import fastify, { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { challengeUser, createNewGame, findNewMatch, getUserGameHistory, getGameMoves } from "../controllers/game.controller";
import { analyzeCompleteGame, getGameAnalysis } from "../services/game.service";
import { stockfishService } from "../services/stockfish.service";

const gameRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/new', createNewGame);
    fastify.post('/find', findNewMatch);
    fastify.post('/challenge', challengeUser);
    fastify.get('/history/:userId', getUserGameHistory);
    fastify.get('/history/detail/:gameId', getGameMoves);

    // Analysis routes
    fastify.get('/analysis/:gameId', async (request: FastifyRequest<{ Params: { gameId: string } }>, reply: FastifyReply) => {
        try {
            const { gameId } = request.params;
            const analysis = await getGameAnalysis(gameId);
            reply.send({ success: true, data: analysis });
        } catch (error: any) {
            reply.status(500).send({ 
                success: false, 
                error: error.message || 'Failed to retrieve analysis' 
            });
        }
    });   
    fastify.post('/analysis/:gameId/comprehensive', async (request: FastifyRequest<{ Params: { gameId: string } }>, reply: FastifyReply) => {
        try {
            const { gameId } = request.params;
            
            // Start analysis in background
            analyzeCompleteGame(gameId).catch(error => {
                console.error('Background analysis failed:', error);
            });
            
            reply.send({ success: true, message: 'Comprehensive analysis started' });
        } catch (error: any) {
            reply.status(500).send({ 
                success: false, 
                error: 'Failed to start comprehensive analysis' 
            });
        }
    });
    fastify.get('/analysis/test', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const isConnected = await stockfishService.testConnection();
            const stats = stockfishService.getUsageStats();
            
            reply.send({ 
                success: true, 
                connected: isConnected,
                stats: stats
            });
        } catch (error) {
            reply.status(500).send({ 
                success: false, 
                error: 'Connection test failed' 
            });
        }
    });

    fastify.post('/analysis/position', async (request: FastifyRequest<{ Body: { fen: string; depth?: number } }>, reply: FastifyReply) => {
        try {
            const { fen, depth = 12 } = request.body;
            console.log('Analyzing position:', fen, 'with depth:', depth);
            if (!fen) {
                reply.status(400).send({ success: false, error: 'FEN position required' });
                return;
            }

            const analysis = await stockfishService.analyzePosition(fen, depth);
            reply.send({ success: true, data: analysis });
        } catch (error: any) {
            reply.status(500).send({ 
                success: false, 
                error: 'Position analysis failed' 
            });
        }
    });
}

export default gameRoutes;