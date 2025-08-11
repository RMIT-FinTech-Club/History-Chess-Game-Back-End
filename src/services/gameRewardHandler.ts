import Web3 from 'web3';
import { IGameSession } from '../models/GameSession.ts';
import { GameReward } from '../models/gameRewards.ts';
import { BlockchainService } from './blockchain.service.ts';
import { postgresPrisma } from '../configs/prismaClient.ts';
import mongoose from 'mongoose';

export class GameRewardHandler {
	private static blockchainService = new BlockchainService();
	
	/**
	 * END GAME PROCESSOR
	 * Called when there is a winner
	 * Does the reward flow from game to blockchain
	 */
	static async handleGameEnd(gameSession: IGameSession, io?: any): Promise<void> {
		if(gameSession.status !== 'finished' ||!gameSession.winner) {
			return;
		}

		try {
			// Get the winner's info
			const winner = await postgresPrisma.users.findUnique({
				where: { id: gameSession.winner }
			});

			if(!winner?.walletAddress){
				console.log(`Can't find wallet address, skipping the reward`);
				return;
			}

			// Get the match type
			const isPvP = gameSession.blackPlayerId && gameSession.whitePlayerId && gameSession.blackPlayerId !== gameSession.whitePlayerId;

			const matchType = isPvP ? 'PvP' : 'Bot';

			// Know the reward amount
			const rewardAmount = isPvP ? Web3.utils.toWei('10', 'ether') : Web3.utils.toWei('5', 'ether');

			// Prevent duplicate rewards
			const existingReward = await GameReward.findOne({ gameSessionId: gameSession.gameId });
			if (existingReward) {
				console.log('Game already rewarded, skipping duplicate reward');
				return;
			}

			// Save the reward
			const gameReward = new GameReward({
				gameSessionId: gameSession.gameId,
				winnerId: gameSession.winner,
				winnerWallet: winner.walletAddress,
				rewardAmount,
				matchType,
				gameResult: gameSession.result,
				gameEndTime: gameSession.endTime ?? new Date(),
				confirmed: false
			});

			await gameReward.save();
			console.log(`Game reward record was created: ${gameReward._id}`);

			// Balance update
			await this.blockchainService.updateBalanceOptimistic(
				gameSession.winner,
				rewardAmount,
				matchType,
				(gameReward._id as any).toString(),
				winner.walletAddress // Safe: validated above
			);

			// UI Update
			if(io) {
				const balanceInfo = await this.blockchainService.getPlayerBalance(gameSession.winner);

				io.to(gameSession.winner).emit('balanceUpdate', {
					balance: balanceInfo.total,
					confirmedBalance: balanceInfo.confirmed,
					pendingBalance: balanceInfo.pending,
					pendingCount: balanceInfo.pendingCount,
					newReward: {
						amount: Web3.utils.fromWei(rewardAmount, 'ether'),
						matchType,
						isPending: true
					},
					message: `You earned ${Web3.utils.fromWei(rewardAmount, 'ether')} GameCoins! Transaction pending...`
				})
			}

			// Queue blockchain transaction
			setImmediate(async () => {
				try {
					await this.blockchainService.processGameReward(gameReward);
					console.log(`Blockchain reward processing initiated for ${winner.username}`);
				} catch(error) {
					console.error('Blockchain reward failed (logged for retry):', error);
				}
			});


		} catch(error) {
			console.error('Error in game reward handler');
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			// Log any failtures for revision, avoiding breaking the game
			if(gameSession.winner) {
				try {
					const winner = await postgresPrisma.users.findUnique({
						where: { id: gameSession.winner }
					});

					const db = mongoose.connection.db;
					if(!db) {
						console.error('MongoDB connection not available, cant log failed transaction');
						return;
					}

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
						retryCount: 0
					})
				} catch(logerror) {
					console.error('Failed to log game reward error');
				}
			}
		}
	}

	// Use API endpoints to show the player's balance 
	static async getPlayerGameCoinBalance(userId: string): Promise<{
		totalGameCoins: string;
		confirmedGameCoins: string;
		pendingGameCoins: string;
		pendingTransactions: number;
		lastUpdated: Date | null;
	}>{
		try {
			const balanceInfo = await this.blockchainService.getPlayerBalance(userId);

			return {
        		totalGameCoins: Web3.utils.fromWei(balanceInfo.total, 'ether'),
				confirmedGameCoins: Web3.utils.fromWei(balanceInfo.confirmed, 'ether'),
				pendingGameCoins: Web3.utils.fromWei(balanceInfo.pending, 'ether'),
				pendingTransactions: balanceInfo.pendingCount,
				lastUpdated: new Date()
			};
		} catch(error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`Error fetching GameCoin balance for ${userId}:`, errorMessage);

			return {
				totalGameCoins: '0',
				confirmedGameCoins: '0', 
				pendingGameCoins: '0',
				pendingTransactions: 0,
				lastUpdated: null
			};
		}
	}

	// Shows all GameCoins earned from chess games
		static async getPlayerRewardHistory(userId: string, limit: number = 10): Promise<Array<{
		gameSessionId: string;
		rewardAmount: string;
		matchType: 'PvP' | 'Bot';
		gameResult: string;
		gameEndTime: Date;
		confirmed: boolean;
		transactionHash?: string;
	}>> {
		try {
		const rewards = await GameReward.find({ winnerId: userId })
			.sort({ gameEndTime: -1 })  // Most recent first
			.limit(limit)
			.lean();  // Return plain objects, not Mongoose documents
		
		// Convert to human-readable format
		return rewards.map(reward => ({
			gameSessionId: reward.gameSessionId,
			rewardAmount: Web3.utils.fromWei(reward.rewardAmount, 'ether'),
			matchType: reward.matchType,
			gameResult: reward.gameResult,
			gameEndTime: reward.gameEndTime,
			confirmed: reward.confirmed,
			transactionHash: reward.transactionHash
		}));
		} catch (error) {
		console.error(`Error fetching reward history for ${userId}:`, error);
		return [];
		}
	}

	static async retryFailedRewards(): Promise<void> {
		try {
		console.log('Starting failed reward retry process...');
		
		// Find failed transactions that haven't exceeded max retry attempts
		const db = mongoose.connection.db;

		if (!db) {
			console.error('MongoDB connection not available, cannot retry failed rewards');
			return;
		}

		const failedTransactions = await db.collection('failedblockchaintransactions')
			.find({
			status: { $in: ['pending', 'retrying'] },
			retryCount: { $lt: 3 }, // Max 3 retries
			// Only retry transactions from the last 24 hours
			firstAttemptAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
			})
			.limit(10) // Process in batches to avoid overwhelming the system
			.toArray();
		
		console.log(`🔍 Found ${failedTransactions.length} failed transactions to retry`);
		
		for (const failedTx of failedTransactions) {
			try {
			console.log(`Retrying reward for user ${failedTx.userId}, game ${failedTx.gameSessionId}`);
			
			// Find the original game session
			const gameSession = await db.collection('gamesessions').findOne({ 
				gameId: failedTx.gameSessionId 
			});
			
			if (gameSession) {
				// Update retry status
				await db.collection('failedblockchaintransactions').updateOne(
				{ _id: failedTx._id },
				{
					$set: { 
					status: 'retrying',
					lastAttemptAt: new Date()
					},
					$inc: { retryCount: 1 }
				}
				);
				
				// Attempt to process the reward again
				await this.handleGameEnd(gameSession as any);
				
				// If successful, mark as resolved
				await db.collection('failedblockchaintransactions').updateOne(
				{ _id: failedTx._id },
				{
					$set: { 
					status: 'resolved',
					resolvedAt: new Date()
					}
				}
				);
				
				console.log(`Successfully retried reward for user ${failedTx.userId}`);
			} else {
				// Game session not found, mark as abandoned
				await db.collection('failedblockchaintransactions').updateOne(
				{ _id: failedTx._id },
				{ $set: { status: 'abandoned' } }
				);
			}
			
			// Small delay between retries to avoid overwhelming the system
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			} catch (retryError) {
				const errorMessage = retryError instanceof Error ? retryError.message : 'Unknown error';
				console.error(`Retry failed for transaction ${failedTx._id}:`, errorMessage);
				
				// Update error information
				await db.collection('failedblockchaintransactions').updateOne(
					{ _id: failedTx._id },
					{
					$set: { 
						error: errorMessage,
						lastAttemptAt: new Date(),
						status: failedTx.retryCount >= 2 ? 'abandoned' : 'pending'
					}
					}
				);
			}
		}
		
		console.log('Failed reward retry process completed');
		
		} catch (error) {
		console.error('Error in retry failed rewards process:', error);
		}
	}

	/**
	 * SYNC STATUS CHECKER
	 * Gets system health information for admin dashboard
	 * Shows statistics about reward processing and any issues
	 */
	static async getSyncStatus(): Promise<{
		totalPlayers: number;
		totalRewards: number;
		pendingRewards: number;
		failedTransactions: number;
		totalGameCoinsIssued: string;
	}> {
		try {
		const db = mongoose.connection.db;

		if(!db) {
			console.error('MongoDB connection not available for sync');
			return {
				totalPlayers: 0,
				totalRewards: 0,
				pendingRewards: 0,
				failedTransactions: 0,
				totalGameCoinsIssued: '0'
			};
		}
		
		const [
			totalPlayers,
			totalRewards,
			pendingRewards,
			failedTransactions,
			allRewards
		] = await Promise.all([
			// Count total players with balances
			db.collection('playerbalances').countDocuments({}),
			
			// Count total rewards issued
			GameReward.countDocuments({}),
			
			// Count pending rewards (not yet confirmed on blockchain)
			GameReward.countDocuments({ confirmed: false }),
			
			// Count failed transactions
			db.collection('failedblockchaintransactions').countDocuments({
			status: { $in: ['pending', 'retrying'] }
			}),
			
			// Get all rewards to calculate total GameCoins issued
			GameReward.find({ confirmed: true }).select('rewardAmount').lean()
		]);
		
		// Calculate total GameCoins issued
		const totalGameCoinsWei = allRewards.reduce((sum, reward) => {
			return sum + BigInt(reward.rewardAmount);
		}, BigInt(0));
		
		const totalGameCoinsIssued = Web3.utils.fromWei(totalGameCoinsWei.toString(), 'ether');
		
		return {
			totalPlayers,
			totalRewards,
			pendingRewards,
			failedTransactions,
			totalGameCoinsIssued
		};
		
		} catch (error) {
		console.error('Error fetching sync status:', error);
		return {
			totalPlayers: 0,
			totalRewards: 0,
			pendingRewards: 0,
			failedTransactions: 0,
			totalGameCoinsIssued: '0'
		};
		}
	}
}