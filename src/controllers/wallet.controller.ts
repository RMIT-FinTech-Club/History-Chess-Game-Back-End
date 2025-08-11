import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GameRewardHandler } from '../services/gameRewardHandler';

interface WalletBalanceRequest extends FastifyRequest {
	params: {
		userId: string;
	};
}

// interface WalletHistoryRequest extends FastifyRequest {
// 	params: {
// 		userId: string;
// 	};
// 	query: {
// 		limit?: number;
// 		offset?: number;
// 	};
// }

interface WalletStatsRequest extends FastifyRequest {
	params: {
		userId: string;
	};
}

export class WalletController {
	private fastify: FastifyInstance;

	constructor(fastify: FastifyInstance) {
		this.fastify = fastify;
	}

	// Get user's wallet balance - /api/wallet/balance/:userId
	async getWalletBalance(request: WalletBalanceRequest, reply: FastifyReply){
		try {
			const { userId } = request.params;

			// Verify that the user is accessing their own wallet
			if((request as any).user.id !== userId) {
				return reply.status(403).send({
					success: false,
					error: 'Access denied: This wallet does NOT belong to this user.'
				});
			}

			const balanceData = await GameRewardHandler.getPlayerGameCoinBalance(userId);

			return reply.status(200).send({
				success: true,
				data: {
					userId,
					...balanceData
				}
			});
		
		} catch(error) {
			this.fastify.log.error('Error fetching wallet balance: ', error);

			return reply.status(500).send({
				success: false,
				error: 'Failed to fetch wallet balance.'
			});
		}


	}

	// Get wallet status - /api/wallet/status/:userId
	async getWalletStatus(request: WalletBalanceRequest, reply: FastifyReply) {
		try {
			const { userId } = request.params;

			// Check authorization
			if((request as any).user.id !== userId) {
				return reply.status(403).send({
					success: false,
					error: 'Access denied: this wallet does NOT belong to the user.'
				});
			}

			const balanceData = await GameRewardHandler.getPlayerGameCoinBalance(userId);
			const hasPendingRewards = parseFloat(balanceData.pendingGameCoins) > 0;

			return reply.status(200).send({
				success: true,
				data: {
					userId,
					hasWallet: true,
					totalBalance: balanceData.totalGameCoins,
					hasPendingRewards,
					pendingCount: balanceData.pendingTransactions,
					lastActivity: balanceData.lastUpdated
				}
			});
		} catch(error) {
			this.fastify.log.error('Error fetching wallet status: ', error);

			return reply.status(500).send({
				success: false,
				error: 'Failed to fetch wallet status'
			})
		}
	}

}