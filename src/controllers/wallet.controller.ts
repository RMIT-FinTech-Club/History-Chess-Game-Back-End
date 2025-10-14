import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GameRewardHandler } from '../services/gameRewardHandler';

interface WalletBalanceRequest extends FastifyRequest {
	// userId will come from authUser
}

interface WalletHistoryRequest extends FastifyRequest {
	query: {
		limit?: number;
	};
}

export class WalletController {
	private fastify: FastifyInstance;

	constructor(fastify: FastifyInstance) {
		this.fastify = fastify;
	}

	/**
	 * GET /wallet/balance
	 * @param request 
	 * @param reply 
	 * @returns 
	 */
	async getWalletBalance(request: WalletBalanceRequest, reply: FastifyReply) {
		try {
			// Get userId from JWT token
			if (!request.authUser) {
				return reply.status(401).send({
					success: false,
					error: 'Authentication required'
				});
			}

			const userId = request.authUser.id;
			const username = request.authUser.username;

			console.log(`[WalletController] getWalletBalance`);
			console.log(`	User: ${username} (${userId})`);

			const balanceData = await GameRewardHandler.getPlayerGameCoinBalance(userId);

			console.log(`[WalletController] Balance fetched successfully`);

			return reply.status(200).send({
				success: true,
				data: {
					userId,
					username,
					...balanceData
				}
			});

		} catch (error) {
			console.error('[WalletController] Error in getWalletBalance:', error);

			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			return reply.status(500).send({
				success: false,
				error: `Failed to fetch wallet balance: ${errorMessage}`
			});
		}

	}

	/**
	 * GET /wallet/status
	 */
	async getWalletStatus(request: WalletBalanceRequest, reply: FastifyReply) {
		try {

			if (!request.authUser) {
				return reply.status(401).send({
					success: false,
					error: 'Authentication required'
				});
			}

			const userId = request.authUser.id;
			const username = request.authUser.username;
			console.log(`\n[WalletController] getWalletStatus`);
			console.log(`	User: ${username} (${userId})`);

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
		} catch (error) {
			console.error("[WalletController] Error in getWalletStatus:", error);

			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			return reply.status(500).send({
				success: false,
				error: `Failed to fetch wallet status: ${errorMessage}`
			});
		}
	}

	/**
	 * GET /wallet/history
	 */
	async getWalletHistory(request: WalletHistoryRequest, reply: FastifyReply) {
		try {
			if (!request.authUser) {
				return reply.status(401).send({
					success: false,
					error: 'Authentication required'
				});
			}

			const userId = request.authUser.id;
			const username = request.authUser.username;

			const limit = Math.min(
				Math.max(request.query.limit || 10, 1), // Min 1
				20 // Max 20
			);

			console.log(`\n[WalletController] getWalletHistory`);
			console.log(`	User: ${username} (${userId})`);
			console.log(`	Limit: ${limit}`);

			const rewards = await GameRewardHandler.getPlayerRewardHistory(userId, limit);

			console.log(`[WalletController] Found ${rewards.length} rewards`);

			return reply.status(200).send({
				success: true,
				data: {
					userId,
					username,
					totalRewards: rewards.length,
					rewards,
					pagination: {
						limit,
						hasMore: rewards.length === limit
					}
				}
			});
		} catch (error) {
			console.error('[WalletController] Error in getWalletHistory:', error);

			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			return reply.status(500).send({
				success: false,
				error: `Failed to fetch wallet history: ${errorMessage}`
			});
		}
	}

	/**
	 * GET /wallet/pending
	 */
	async getPendingTransactions(request: WalletBalanceRequest, reply: FastifyReply) {
		try {
			if (!request.authUser) {
				return reply.status(401).send({
					success: false,
					error: 'Authentication required'
				});

			}

			const userId = request.authUser.id;
			const username = request.authUser.username;

			console.log(`\n[WalletController] getPendingTransactions`);
			console.log(`	User: ${username} (${userId})`);

			const pendingData = await GameRewardHandler.getPendingTransactions(userId);

			console.log(`[WalletController] Found ${pendingData.pendingTransactions.length} pending transactions`);

			return reply.status(200).send({
				success: true,
				data: {
					userId,
					username,
					...pendingData
				}
			});
		} catch (error) {
			console.error('[WalletController] Error in getPendingTransactions:', error);

			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			return reply.status(500).send({
				success: false,
				error: `Failed to fetch pending transactions: ${errorMessage}`
			});
		}
	}

}