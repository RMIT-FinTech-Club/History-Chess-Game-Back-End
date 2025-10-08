import { getRabbitMQ } from '../configs/rabbitmq.ts';
import { BlockchainService } from '../services/blockchain.service.ts';
import { GameReward } from '../models/gameRewards.ts';
import { PlayerBalance } from '../models/playerBalance.ts';
import { RewardMessage } from '../queues/publishers/reward.publisher.ts';
import Web3 from 'web3';
import type { ConsumeMessage } from 'amqplib';

export class BlockchainWorker {
  private blockchainService: BlockchainService;
  private isRunning = false;

  constructor() {
    this.blockchainService = new BlockchainService();
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Worker already running');
      return;
    }

    console.log('\n Starting Blockchain Worker...\n');
    console.log('='.repeat(80));

    try {
      const rabbitmq = getRabbitMQ();

      if (!rabbitmq.isConnected()) {
        throw new Error('RabbitMQ not connected. Call initializeRabbitMQ() first.');
      }

      const channel = rabbitmq.getChannel();
      const queues = rabbitmq.getQueues();

      console.log(`✅ Worker connected to RabbitMQ`);
      console.log('='.repeat(80) + '\n');

      this.isRunning = true;

      await channel.consume(
        queues.rewardQueue,
        async (msg: ConsumeMessage | null) => {
          if (!msg) {
            console.log('⚠️  Received null message');
            return;
          }

          await this.processMessage(msg, channel);
        },
        {
          noAck: false,
        }
      );

      console.log('Worker is now processing messages...\n');

    } catch (error) {
      console.error('⚠️ Failed to start worker:', error);
      this.isRunning = false;
      throw error;
    }
  }

  private async processMessage(
    msg: ConsumeMessage,
    channel: any
  ): Promise<void> {
    const startTime = Date.now();
    
    console.log('\n' + '='.repeat(80));
    console.log(' NEW MESSAGE RECEIVED');
    console.log('='.repeat(80));

    try {
      const messageContent = msg.content.toString();
      const rewardMessage: RewardMessage = JSON.parse(messageContent);

      console.log(`\n Message Details:`);
      console.log(`   User: ${rewardMessage.username} (${rewardMessage.userId})`);
      console.log(`   Wallet: ${rewardMessage.walletAddress}`);
      console.log(`   Amount: ${Web3.utils.fromWei(rewardMessage.amount, 'ether')} GameCoins`);
      console.log(`   Game ID: ${rewardMessage.gameId}`);
      console.log(`   Match Type: ${rewardMessage.matchType}`);
      console.log(`   Reward ID: ${rewardMessage.gameRewardId}`);

      // Step 1: Get GameReward
      console.log(`\n Step 1: Fetching GameReward from database...`);
      const gameReward = await GameReward.findById(rewardMessage.gameRewardId);

      if (!gameReward) {
        throw new Error(`GameReward ${rewardMessage.gameRewardId} not found`);
      }

      console.log(`   ✅ GameReward found`);

      if (gameReward.transactionHash) {
        console.log(`   ⚠️  Already processed: ${gameReward.transactionHash}`);
        console.log(`   ✅ Acknowledging message (duplicate)`);
        channel.ack(msg);
        return;
      }

      // Step 2: Send blockchain transaction
      console.log(`\n  Step 2: Sending blockchain transaction...`);
      console.log(`   Contract: ${process.env.GAME_COIN_CONTRACT_ADDRESS}`);
      console.log(`   Method: ${rewardMessage.matchType === 'PvP' ? 'rewardPvPWin' : 'rewardBotWin'}`);
      console.log(`   Recipient: ${rewardMessage.walletAddress}`);

      await this.blockchainService.processGameReward(gameReward);

      const updatedGameReward = await GameReward.findById(rewardMessage.gameRewardId);
      
      if (!updatedGameReward?.transactionHash) {
        throw new Error('Transaction hash not saved');
      }

      console.log(`   ✅ Transaction sent successfully!`);
      console.log(`    TX Hash: ${updatedGameReward.transactionHash}`);
      console.log(`    Block: ${updatedGameReward.blockNumber}`);

      // Step 3: Update PlayerBalance
      console.log(`\n Step 3: Updating PlayerBalance...`);
      
      await this.updatePlayerBalance(
        rewardMessage.userId,
        rewardMessage.walletAddress,
        rewardMessage.amount,
        updatedGameReward.transactionHash,
        rewardMessage.matchType
      );

      console.log(`   ✅ Balance updated successfully`);

      // Step 4: Mark GameReward as confirmed
      console.log(`\n Step 4: Marking GameReward as confirmed...`);
      
      await GameReward.findByIdAndUpdate(rewardMessage.gameRewardId, {
        confirmed: true,
        confirmedAt: new Date()
      });

      console.log(`   ✅ GameReward confirmed`);

      channel.ack(msg);

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n' + '='.repeat(80));
      console.log('✅ MESSAGE PROCESSED SUCCESSFULLY');
      console.log('='.repeat(80));
      console.log(`  Processing time: ${processingTime}s`);
      console.log(` User: ${rewardMessage.username}`);
      console.log(` Amount: ${Web3.utils.fromWei(rewardMessage.amount, 'ether')} GC`);
      console.log(` TX Hash: ${updatedGameReward.transactionHash}`);
      console.log('='.repeat(80) + '\n');

    } catch (error) {
      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.error('\n' + '='.repeat(80));
      console.error('⚠️ MESSAGE PROCESSING FAILED');
      console.error('='.repeat(80));
      console.error(`  Failed after: ${processingTime}s`);
      console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('='.repeat(80) + '\n');

      channel.nack(msg, false, false);
      
      console.log('⚠️  Message sent to DLQ for manual review\n');
    }
  }

  /**
   * Update PlayerBalance - Create if doesn't exist
   */
  private async updatePlayerBalance(
    userId: string,
    walletAddress: string,
    amount: string,
    transactionHash: string,
    matchType: 'PvP' | 'Bot'
  ): Promise<void> {
    try {
      let playerBalance = await PlayerBalance.findOne({ userId });

      //Create PlayerBalance if it doesn't exist
      if (!playerBalance) {
        
        playerBalance = new PlayerBalance({
          userId,
          walletAddress: walletAddress.toLowerCase(),
          balance: amount, // Start with confirmed balance (transaction already succeeded)
          pendingBalance: '0',
          version: 1,
          lastUpdated: new Date(),
          lastSyncedBlock: 0,
          pendingTransactions: [{
            transactionHash,
            amount,
            type: matchType,
            status: 'confirmed',
            createdAt: new Date()
          }],
          rewardIds: [],
          needsSync: false
        });

        await playerBalance.save();

        console.log(`    Balance: ${Web3.utils.fromWei(amount, 'ether')} GC (confirmed)`);
        return;
      }

      // ✅ PlayerBalance exists - Update it
      console.log(`   📝 Updating existing PlayerBalance for user ${userId}`);

      // Find the pending transaction
      const pendingTxIndex = playerBalance.pendingTransactions.findIndex(
        tx => tx.transactionHash === `pending-${transactionHash}` ||
              tx.transactionHash === transactionHash
      );

      const currentBalance = BigInt(playerBalance.balance || '0');
      const currentPending = BigInt(playerBalance.pendingBalance || '0');
      const rewardAmount = BigInt(amount);

      let newBalance: string;
      let newPending: string;

      if (pendingTxIndex !== -1) {
        // Transaction was in pending list - move to confirmed
        newBalance = (currentBalance + rewardAmount).toString();
        newPending = (currentPending - rewardAmount).toString();

        await PlayerBalance.updateOne(
          { userId },
          {
            $set: {
              balance: newBalance,
              pendingBalance: newPending,
              [`pendingTransactions.${pendingTxIndex}.status`]: 'confirmed',
              [`pendingTransactions.${pendingTxIndex}.transactionHash`]: transactionHash,
              lastUpdated: new Date()
            }
          }
        );

        console.log(`   ✅ Moved from pending to confirmed`);
      } else {
        // Transaction was NOT in pending list - add directly to confirmed
        newBalance = (currentBalance + rewardAmount).toString();
        newPending = currentPending.toString();

        await PlayerBalance.updateOne(
          { userId },
          {
            $set: {
              balance: newBalance,
              lastUpdated: new Date()
            },
            $push: {
              pendingTransactions: {
                transactionHash,
                amount,
                type: matchType,
                status: 'confirmed',
                createdAt: new Date()
              }
            }
          }
        );

        console.log(`   ✅ Added directly to confirmed balance`);
      }

      console.log(`    Balance: ${Web3.utils.fromWei(newBalance, 'ether')} GC (confirmed)`);
      console.log(`    Pending: ${Web3.utils.fromWei(newPending, 'ether')} GC`);

    } catch (error) {
      console.error(`   ⚠️ Error updating PlayerBalance:`, error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    console.log('\n⚠️ Stopping Blockchain Worker...');
    this.isRunning = false;
    console.log('✅ Worker stopped\n');
  }

  public getStatus(): { running: boolean } {
    return { running: this.isRunning };
  }
}

let workerInstance: BlockchainWorker | null = null;

export function getBlockchainWorker(): BlockchainWorker {
  if (!workerInstance) {
    workerInstance = new BlockchainWorker();
  }
  return workerInstance;
}