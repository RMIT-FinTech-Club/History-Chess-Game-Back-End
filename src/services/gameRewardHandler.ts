import Web3 from 'web3';
import { IGameSession } from '../models/GameSession.ts';
import { GameReward } from '../models/gameRewards.ts';
import { PlayerBalance } from '../models/playerBalance.ts';
import { postgresPrisma } from '../configs/prismaClient.ts';
import { RewardPublisher, RewardMessage } from '../queues/publishers/reward.publisher.ts';
import mongoose from 'mongoose';


export class GameRewardHandler {
	/**
	 * END GAME PROCESSOR (UPDATED with RabbitMQ)
	 * Called when there is a winner
	 * Flow: Create reward → Optimistic update → Publish to RabbitMQ
	 */
	static async handleGameEnd(gameSession: IGameSession, io?: any): Promise<void> {
		if (gameSession.status !== 'finished' || !gameSession.winner) {
			return;
		}

		try {
			console.log(`\n Processing game end for game: ${gameSession.gameId}`);
			console.log(`   Winner: ${gameSession.winner}`);

			// Get the winner's info
			const winner = await postgresPrisma.users.findUnique({
				where: { id: gameSession.winner }
			});

			if (!winner) {
				console.log(`❌ Winner user ${gameSession.winner} not found`);
				return;
			}

			if (!winner.walletAddress) {
				console.log(`⚠️  Winner ${winner.username} has no wallet address, skipping reward`);
				return;
			}

			console.log(`✅ Winner found: ${winner.username} (${winner.walletAddress})`);

			// Determine match type
			const isPvP = gameSession.blackPlayerId &&
				gameSession.whitePlayerId &&
				gameSession.blackPlayerId !== gameSession.whitePlayerId;

			const matchType = isPvP ? 'PvP' : 'Bot';
			const rewardAmount = isPvP ? Web3.utils.toWei('10', 'ether') : Web3.utils.toWei('5', 'ether');

			console.log(`   Match Type: ${matchType}`);
			console.log(`   Reward Amount: ${Web3.utils.fromWei(rewardAmount, 'ether')} GameCoins`);

			// Check for duplicate rewards
			const existingReward = await GameReward.findOne({ gameSessionId: gameSession.gameId });
			if (existingReward) {
				console.log('⚠️  Game already rewarded, skipping duplicate');
				return;
			}

			// ============================================
			// PHASE 1: CREATE REWARD RECORD (Instant)
			// ============================================
			console.log('\n📝 PHASE 1: Creating GameReward record...');

			const gameReward = new GameReward({
				gameSessionId: gameSession.gameId,
				winnerId: gameSession.winner,
				winnerWallet: winner.walletAddress,
				rewardAmount,
				matchType,
				gameResult: gameSession.result,
				gameEndTime: gameSession.endTime ?? new Date(),
				confirmed: false // Initially unconfirmed
			});

			const savedGameReward = await gameReward.save();
			const gameRewardId = savedGameReward._id?.toString() || '';

			console.log(`✅ GameReward created: ${gameRewardId}`);

			// ============================================
			// PHASE 2: OPTIMISTIC UI UPDATE (Instant)
			// ============================================
			console.log('\n⚡ PHASE 2: Optimistic UI update...');

			if (io) {
				io.to(gameSession.winner).emit('balanceUpdate', {
					userId: gameSession.winner,
					status: 'pending',
					amount: Web3.utils.fromWei(rewardAmount, 'ether'),
					matchType,
					message: `You earned ${Web3.utils.fromWei(rewardAmount, 'ether')} GameCoins! Processing blockchain transaction...`
				});

				console.log(`✅ Instant UI notification sent to ${winner.username}`);
			}

			// ============================================
			// PHASE 3: PUBLISH TO RABBITMQ (Async)
			// ============================================
			console.log('\n📤 PHASE 3: Publishing to RabbitMQ...');

			const rewardMessage: RewardMessage = {
				userId: gameSession.winner,
				username: winner.username,
				walletAddress: winner.walletAddress,
				amount: rewardAmount,
				gameId: gameSession.gameId,
				matchType,
				gameRewardId,
				timestamp: new Date(),
				transactionType: 'reward',
				metadata: {
					gameResult: gameSession.result,
					opponentId: isPvP ? (gameSession.winner === gameSession.whitePlayerId ? gameSession.blackPlayerId : gameSession.whitePlayerId) : undefined,
					gameEndTime: gameSession.endTime ?? new Date()
				}
			};

			// Publish to queue when there is any winner
			const published = await RewardPublisher.publishReward(rewardMessage);

			if (published) {
				console.log('✅ Reward message published to RabbitMQ');
				console.log('   Worker will process blockchain transaction in background');
			} else {
				console.warn('⚠️ RabbitMQ queue buffer full, message will be retried');
			}

			// ============================================
			// PHASE 4: LOG SUCCESS
			// ============================================
			console.log('\n✅ Game reward flow completed successfully');
			console.log('='.repeat(80));
			console.log(`Summary:`);
			console.log(`   Winner: ${winner.username}`);
			console.log(`   Amount: ${Web3.utils.fromWei(rewardAmount, 'ether')} GC`);
			console.log(`   Match Type: ${matchType}`);
			console.log(`   Status: Queued for blockchain processing`);
			console.log('='.repeat(80) + '\n');

		} catch (error) {
			console.error('⚠️ Error in game reward handler:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			// Log failure for manual review
			if (gameSession.winner) {
				try {
					const winner = await postgresPrisma.users.findUnique({
						where: { id: gameSession.winner }
					});

					const db = mongoose.connection.db;
					if (db) {
						await db.collection('failedblockchaintransactions').insertOne({
							userId: gameSession.winner,
							walletAddress: winner?.walletAddress || 'unknown',
							transactionType: 'reward',
							amount: '0',
							error: errorMessage,
							gameSessionId: gameSession.gameId,
							status: 'failed',
							firstAttemptAt: new Date(),
							lastAttemptAt: new Date(),
							retryCount: 0,
							phase: 'game_end_handler'
						});

						console.log('📝 Error logged to failedblockchaintransactions');
					}
				} catch (logError) {
					console.error('❌ Failed to log error:', logError);
				}
			}

			throw error;
		}
	}

	/**
	 * Get player balance ---> return current balance (confirmed + pending)
	 */
	static async getPlayerGameCoinBalance(userId: string): Promise<{
		totalGameCoins: string;
		confirmedGameCoins: string;
		pendingGameCoins: string;
		pendingTransactions: number;
		lastUpdated: Date | null;
	}> {
		try {

			// Check if user exists
			const user = await postgresPrisma.users.findUnique({
				where: { id: userId },
				select: { walletAddress: true, username: true }
			});

			if (!user) {
				console.log(`[getPlayerGameCoinBalance] User ${userId} not found`);
				throw new Error(`User ${userId} not found`);
			}

			console.log(`[getPlayerGameCoinBalance] User: ${user.username}`);

			// If no wallet address, return zeros
			if (!user.walletAddress) {
				console.log(`User ${user.username} has no wallet address`);
				return {
					totalGameCoins: '0.0000',
					confirmedGameCoins: '0.0000',
					pendingGameCoins: '0.0000',
					pendingTransactions: 0,
					lastUpdated: new Date()
				};
			}

			// Query PlayerBalance from MongoDB
			const playerBalance = await PlayerBalance.findOne({ userId });
			if (!playerBalance) {
				return {
					totalGameCoins: '0.0000',
					confirmedGameCoins: '0.0000',
					pendingGameCoins: '0.0000',
					pendingTransactions: 0,
					lastUpdated: new Date()
				};
			}

			// Calculate balances
			const confirmed = Web3.utils.fromWei(playerBalance.balance || '0', 'ether');
			const pending = Web3.utils.fromWei(playerBalance.pendingBalance || '0', 'ether');
			const total = (parseFloat(confirmed) + parseFloat(pending)).toFixed(4);

			const pendingCount = playerBalance.pendingTransactions
				.filter(tx => tx.status === 'pending')
				.length;

			console.log(`   Total: ${total} GC`);
			console.log(`   Confirmed: ${confirmed} GC`);
			console.log(`   Pending: ${pending} GC`);
			console.log(`   Pending TXs: ${pendingCount}`);

			return {
				totalGameCoins: total,
				confirmedGameCoins: confirmed,
				pendingGameCoins: pending,
				pendingTransactions: pendingCount,
				lastUpdated: playerBalance.lastUpdated
			};

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`[getPlayerGameCoinBalance] Error:`, errorMessage);

			return {
				totalGameCoins: '0.0000',
				confirmedGameCoins: '0.0000',
				pendingGameCoins: '0.0000',
				pendingTransactions: 0,
				lastUpdated: null
			};
		}
	}

	/**
	 * GET PLAYER REWARD HISTORY
	 */
	static async getPlayerRewardHistory(userId: string, limit: number = 10): Promise<Array<{ // giới hạn số reward có thể fetch để không bị chậm
		gameSessionId: string;
		rewardAmount: string;
		matchType: 'PvP' | 'Bot';
		gameResult: string;
		gameEndTime: Date;
		confirmed: boolean;
		transactionHash?: string;
		blockNumber?: number;
		confirmedAt?: Date;
	}>> {
		try {
			console.log(`\n[getPlayerRewardHistory] Fetching for userId: ${userId}, limit: ${limit}`);

			// Validate limit
			const validLimit = Math.min(Math.max(limit, 1), 20); // between 1-20

			const rewards = await GameReward.find({ winnerId: userId })
				.sort({ gameEndTime: -1 }) // most recent first
				.limit(validLimit)
				.lean();

			console.log(`[getPlayerRewardHistory] Found ${rewards.length} rewards`);

			return rewards.map(reward => ({
				gameSessionId: reward.gameSessionId,
				rewardAmount: Web3.utils.fromWei(reward.rewardAmount, 'ether'),
				matchType: reward.matchType,
				gameResult: reward.gameResult,
				gameEndTime: reward.gameEndTime,
				confirmed: reward.confirmed,
				transactionHash: reward.transactionHash,
				blockNumber: reward.blockNumber,
				confirmedAt: reward.confirmedAt
			}));
		} catch (error) {
			console.error(`[getPlayerRewardHistory] Error fetching reward for ${userId}:`, error);
			return [];
		}

	}

	/**
	 * GET PENDING TRANSACTIONS
	 */
	static async getPendingTransactions(userId: string): Promise<{
		pendingBalance: string;
		pendingTransactions: Array<{
			transactionHash: string;
			amount: string;
			type: 'PvP' | 'Bot';
			status: string;
			createdAt: Date;
			blockNumber?: number;
		}>;
	}> {
		try {
			console.log(`\n[getPendingTransactions] Fetching for userId: ${userId}`);
			const playerBalance = await PlayerBalance.findOne({ userId });

			if (!playerBalance) {
				console.log(`[getPendingTransactions] No PlayerBalance found for ${userId}`);
				return {
					pendingBalance: '0.0000',
					pendingTransactions: [],
				};
			}

			// Filter only pending transactions
			const pendingTxs = playerBalance.pendingTransactions
				.filter(tx => tx.status === 'pending')
				.map(tx => ({
					transactionHash: tx.transactionHash,
					amount: Web3.utils.fromWei(tx.amount, 'ether'),
					type: tx.type,
					status: tx.status,
					createdAt: tx.createdAt,
					blockNumber: tx.blockNumber
				}));

			const pendingBalance = Web3.utils.fromWei(playerBalance.pendingBalance || '0', 'ether');

			console.log(`[getPendingTransactions] Found ${pendingTxs.length} pending transactions`);
			console.log(`  Pending Balance: ${pendingBalance}GC`);

			return {
				pendingBalance,
				pendingTransactions: pendingTxs
			};
		} catch (error) {
			console.error(`[getPendingTransactions] Error:`, error);
			return {
				pendingBalance: '0.0000',
				pendingTransactions: []
			}
		}
	}
}
