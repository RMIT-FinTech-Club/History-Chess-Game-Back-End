import Web3 from 'web3';
import { IGameSession } from '../models/GameSession.ts';
import { GameReward } from '../models/gameRewards.ts';
import { postgresPrisma } from '../configs/prismaClient.ts';
import { RewardPublisher, RewardMessage } from '../queues/publishers/reward.publisher.ts';

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
      console.log(`\n🎮 Processing game end for game: ${gameSession.gameId}`);
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
   * Get player balance (existing method - no changes)
   */
  static async getPlayerGameCoinBalance(userId: string): Promise<{
    totalGameCoins: string;
    confirmedGameCoins: string;
    pendingGameCoins: string;
    pendingTransactions: number;
    lastUpdated: Date | null;
  }> {
    try {
      console.log(`[getPlayerGameCoinBalance] Starting for userId: ${userId}`);

      const user = await postgresPrisma.users.findUnique({
        where: { id: userId },
        select: { walletAddress: true, username: true }
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (!user.walletAddress) {
        console.log(`User ${user.username} has no wallet address - returning zeros`);
        return {
          totalGameCoins: '0.0000',
          confirmedGameCoins: '0.0000',
          pendingGameCoins: '0.0000',
          pendingTransactions: 0,
          lastUpdated: new Date()
        };
      }

      // Since playerbalances collection might be empty initially
      console.log(`PlayerBalance collection check...`);
      return {
        totalGameCoins: '0.0000',
        confirmedGameCoins: '0.0000',
        pendingGameCoins: '0.0000',
        pendingTransactions: 0,
        lastUpdated: new Date()
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
}

// Import mongoose at the top if not already
import mongoose from 'mongoose';