import { FastifyPluginAsync } from "fastify";
import { CompositionRoot } from "../configs/compositionRoot";
import { authenticate } from "../middleware/auth";
import { asyncErrorWrapper } from "../middleware/asyncErrorWrapper";

const gameRoutes: FastifyPluginAsync = async (fastify) => {
    const { gameController } = CompositionRoot.getInstance();

    fastify.post('/new', asyncErrorWrapper(gameController.createNewGame.bind(gameController)));
    fastify.post('/find', asyncErrorWrapper(gameController.findNewMatch.bind(gameController)));
    fastify.get('/history/:userId', { preHandler: authenticate }, asyncErrorWrapper(gameController.getGameHistory.bind(gameController)));
    // Add detail and analysis routes if I implement them in controller
}

export default gameRoutes;