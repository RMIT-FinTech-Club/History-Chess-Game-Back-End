import { getRabbitMQ } from '../../configs/rabbitmq.ts';

/**
 * Reward Message Structure
 */
export interface RewardMessage {
  userId: string;
  username?: string;
  walletAddress: string;
  amount: string; // In wei (string to handle BigInt)
  gameId: string;
  matchType: 'PvP' | 'Bot';
  gameRewardId: string; // MongoDB ObjectId as string
  timestamp: Date;
  transactionType: 'reward';
  metadata?: {
    gameResult?: string;
    opponentId?: string;
    gameEndTime?: Date;
  };
}

/**
 * Publishes reward messages to RabbitMQ queue
 */
export class RewardPublisher {
  static async publishReward(message: RewardMessage): Promise<boolean> {
    try {
      console.log('\n Publishing reward message to RabbitMQ...');
      console.log(`   User: ${message.userId}`);
      console.log(`   Amount: ${message.amount} wei`);
      console.log(`   Game: ${message.gameId}`);

      const rabbitMQ = getRabbitMQ();

      // Check connection
      if (!rabbitMQ.isConnected()) {
        console.error('⚠️ RabbitMQ not connected');
        throw new Error('RabbitMQ connection not available');
      }

      const channel = rabbitMQ.getChannel();
      const queues = rabbitMQ.getQueues();

      // Convert message to Buffer
      const messageBuffer = Buffer.from(JSON.stringify(message));

      // Publish to queue
      const published = channel.sendToQueue(
        queues.rewardQueue,
        messageBuffer,
        {
          persistent: true, // Message is saved to Disk ---> if the server restarts or crashes, the message will be saved
          contentType: 'application/json',
          timestamp: Date.now(),
          messageId: `reward-${message.gameRewardId}`,
          headers: {
            userId: message.userId,
            gameId: message.gameId,
            matchType: message.matchType,
            version: '1.0',
          },
        }
      );

      if (published) {
        console.log(`✅ Reward message published successfully`);
        console.log(`   Queue: ${queues.rewardQueue}`);
        console.log(`   Message ID: reward-${message.gameRewardId}`);
        return true;
      } else {
        console.warn('⚠️  Queue buffer full, message will be buffered');
        return false;
      }

    } catch (error) {
      console.error('⚠️ Failed to publish reward message:', error);
      throw error;
    }
  }

  /**
   * Publish multiple rewards in batch -- 
   */
  static async publishBatch(messages: RewardMessage[]): Promise<{
    success: number;
    failed: number;
    errors: Array<{ message: RewardMessage; error: string }>;
  }> {
    console.log(`\n📤 Publishing ${messages.length} reward messages...`);

    let success = 0;
    let failed = 0;
    const errors: Array<{ message: RewardMessage; error: string }> = [];

    for (const message of messages) {
      try {
        await this.publishReward(message);
        success++;
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ message, error: errorMessage });
        console.error(`❌ Failed to publish reward for ${message.userId}: ${errorMessage}`);
      }
    }

    console.log(`\n📊 Batch publish results:`);
    console.log(`   ✅ Success: ${success}/${messages.length}`);
    console.log(`   ❌ Failed: ${failed}/${messages.length}`);

    return { success, failed, errors };
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(): Promise<{
    messageCount: number;
    consumerCount: number;
  } | null> {
    try {
      const rabbitMQ = getRabbitMQ();
      
      if (!rabbitMQ.isConnected()) {
        return null;
      }

      const channel = rabbitMQ.getChannel();
      const queues = rabbitMQ.getQueues();

      const queueInfo = await channel.checkQueue(queues.rewardQueue);

      return {
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
      };

    } catch (error) {
      console.error('⚠️ Failed to get queue stats:', error);
      return null;
    }
  }
}