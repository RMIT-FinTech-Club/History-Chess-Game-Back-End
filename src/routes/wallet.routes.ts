import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WalletController } from '../controllers/wallet.controller.ts';
import {
	getWalletBalanceSchema,
	getWalletStatusSchema,
	getWalletHistorySchema,
	getPendingTransactionsSchema
} from './schemas/walletSchema.ts';
import { authenticate } from '../middleware/auth.ts';

export default async function walletRoutes(fastify: FastifyInstance) {
	const walletController = new WalletController(fastify);

	/**
	 * WALLET BALANCE ENDPOINT
	 */
	fastify.get('/wallet/balance', {
		schema: getWalletBalanceSchema,
		preHandler: [authenticate],
		handler: async (request: FastifyRequest, reply: FastifyReply) => {
			return walletController.getWalletBalance(request, reply);
		},
	});

	/**
	 * WALLET STATUS ENDPOINT
	 */
	fastify.get('/wallet/status', {
		schema: getWalletStatusSchema,
		preHandler: [authenticate],
		handler: async (request: FastifyRequest, reply: FastifyReply) => {
			return walletController.getWalletStatus(request, reply);
		}
	});

	/**
	 * WALLET HISTORY ENDPOINT
	 */
	fastify.get('/wallet/history', {
		schema: getWalletHistorySchema,
		preHandler: [authenticate],
		handler: async (request: FastifyRequest, reply: FastifyReply) => {
			return walletController.getWalletHistory(request, reply);
		}
	});

	/**
	 * PENDING TRANSACTIONS ENDPOINT
	 */
	fastify.get('/wallet/pending', {
		schema: getPendingTransactionsSchema,
		preHandler: [authenticate],
		handler: async (request: FastifyRequest, reply: FastifyReply) => {
			return walletController.getPendingTransactions(request, reply);
		}
	});
}