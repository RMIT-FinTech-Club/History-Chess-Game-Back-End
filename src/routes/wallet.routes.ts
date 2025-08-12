import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WalletController } from '../controllers/wallet.controller.ts';
import {
	getWalletBalanceSchema,
	getWalletStatusSchema
} from './schemas/walletSchema.ts';
import { authenticate } from '../middleware/auth.ts';

// Define request interfaces
interface WalletParams {
	Params: { userId: string };
}

export default async function walletRoutes(fastify: FastifyInstance) {
	const walletController = new WalletController(fastify);

	// /wallet/balance/:userId
	fastify.get('/wallet/balance/:userId', {
		schema: getWalletBalanceSchema,
		preHandler: [authenticate],
		handler: async (request: FastifyRequest<WalletParams>, reply: FastifyReply) => {
			return walletController.getWalletBalance(request, reply);
		},
	});

	// /wallet/status/:userId
	fastify.get('/wallet/status/:userId', {
		schema: getWalletStatusSchema,
		preHandler: [authenticate],
		handler: async (request: FastifyRequest<WalletParams>, reply: FastifyReply) => {
			return walletController.getWalletStatus(request, reply);
		}
	});
}