import { getRabbitMQ } from '../../configs/rabbitmq.ts';

/**
 * Message Structure for RabbitMQ messages
 */
export interface GenericBlockchainMessage {
  userId: string;
  transactionType: 'reward' | 'buyItem' | 'auctionWin';
  transactionId?: string; // MongoDB ID for TransactionHistory or GameReward
  timestamp: Date;
}

export interface RewardMessage extends GenericBlockchainMessage {
  transactionType: 'reward';
  username?: string;
  walletAddress: string;
  amount: string; // In wei
  gameId: string;
  matchType: 'PvP' | 'Bot';
  gameRewardId: string; // MongoDB ObjectId as string
  metadata?: {
    gameResult?: string;
    opponentId?: string;
    gameEndTime?: Date;
  };
}

export interface BuyItemMessage extends GenericBlockchainMessage {
  transactionType: 'buyItem';
  itemId: string;
  quantity: number;
  totalCost: string; // In wei
}

export interface AuctionWinMessage extends GenericBlockchainMessage {
  transactionType: 'auctionWin';
  winnerId: string;
  sellerId: string;
  nftId: string;
  amount: string; // In wei
}

export type BlockchainMessage = RewardMessage | BuyItemMessage | AuctionWinMessage;

/**
 * Publishes messages to RabbitMQ queue
 */
export class RewardPublisher {
  static async publishMessage(message: BlockchainMessage): Promise<boolean> {
    try {
      console.log(`\n Publishing ${message.transactionType} message to RabbitMQ...`);
      
      const rabbitMQ = getRabbitMQ();

      if (!rabbitMQ.isConnected()) {
        console.error('⚠️ RabbitMQ not connected');
        throw new Error('RabbitMQ connection not available');
      }

      const channel = rabbitMQ.getChannel();
      const queues = rabbitMQ.getQueues();

      const messageBuffer = Buffer.from(JSON.stringify(message));

      const published = channel.sendToQueue(
        queues.rewardQueue,
        messageBuffer,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
          messageId: `${message.transactionType}-${message.transactionId || Date.now()}`,
        }
      );

      if (published) {
        console.log(`✅ ${message.transactionType} message published successfully`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('⚠️ Failed to publish message:', error);
      throw error;
    }
  }

  // Backwards compatibility or specific helper
  static async publishReward(message: RewardMessage): Promise<boolean> {
      return this.publishMessage(message);
  }
}