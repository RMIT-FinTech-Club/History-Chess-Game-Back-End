import { getRabbitMQ } from '../../configs/rabbitmq.ts';

/**
 * Stockfish Message Structure
 */
export interface StockfishMessage {
  gameId: string;
  fenBeforeMove: string;
  moveDetails: any; // Move object from chess.js
  moveNumber: number;
}

/**
 * Publishes stockfish analysis messages to RabbitMQ queue
 */
export class StockfishPublisher {
  static async publishMoveAnalysis(message: StockfishMessage): Promise<boolean> {
    try {
      const rabbitMQ = getRabbitMQ();

      if (!rabbitMQ.isConnected()) {
        console.error('⚠️ RabbitMQ not connected');
        throw new Error('RabbitMQ connection not available');
      }

      const channel = rabbitMQ.getChannel();
      const queues = rabbitMQ.getQueues();

      // Ensure queue exists or use a defined stockfishQueue
      // In configs/rabbitmq.ts there might not be stockfishQueue defined yet. 
      // We will assert the queue inline if needed, or assume it's there.
      const queueName = queues.stockfishQueue || 'stockfish_queue';

      const messageBuffer = Buffer.from(JSON.stringify(message));

      const published = channel.sendToQueue(
        queueName,
        messageBuffer,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
        }
      );

      if (published) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('⚠️ Failed to publish stockfish message:', error);
      throw error;
    }
  }
}
