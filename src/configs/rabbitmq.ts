import amqp from 'amqplib';

export interface RabbitMQConfig {
  url: string;
  queues: {
    rewardQueue: string; // recieves messages from the game server when there are winners
    rewardDLQ: string; // recieves failed messages
  };
  prefetchCount: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
}

type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type Channel = Awaited<ReturnType<Connection['createChannel']>>;

export class RabbitMQConnection {
  private static instance: RabbitMQConnection;
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private config: RabbitMQConfig;
  private reconnectAttempts = 0;
  private isConnecting = false;

  private constructor() {
    this.config = {
      url: process.env.RABBITMQ_URL,
      queues: {
        rewardQueue: process.env.RABBITMQ_REWARD_QUEUE,
        rewardDLQ: process.env.RABBITMQ_REWARD_DLQ,
      },
      prefetchCount: parseInt(process.env.RABBITMQ_PREFETCH_COUNT || '1', 10), 
      reconnectDelay: 5000,
      maxReconnectAttempts: 3,
    };
  }

  public static getInstance(): RabbitMQConnection {
    if (!RabbitMQConnection.instance) {
      RabbitMQConnection.instance = new RabbitMQConnection();
    }
    return RabbitMQConnection.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('RabbitMQ connection already in progress...');
      return;
    }

    if (this.connection && this.channel) {
      console.log('✅ RabbitMQ already connected');
      return;
    }

    this.isConnecting = true;

    try {
      console.log('   Connecting to RabbitMQ...');
      console.log(`   URL: ${this.config.url}`);

      // Connect to RabbitMQ
      this.connection = await amqp.connect(this.config.url);
      console.log('✅ RabbitMQ connection established');

      // Create channel
      this.channel = await this.connection.createChannel();
      console.log('✅ RabbitMQ channel created');

      // Set prefetch count
      await this.channel.prefetch(this.config.prefetchCount);

      // Setup error handlers
      this.connection.on('error', (err: Error) => {
        console.error('⚠️ RabbitMQ connection error:', err);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        console.log('⚠️  RabbitMQ connection closed');
        this.handleConnectionClose();
      });

      // Setup queues
      await this.setupQueues();

      this.reconnectAttempts = 0;
      this.isConnecting = false;

      console.log('✅ RabbitMQ setup completed successfully\n');

    } catch (error) {
      this.isConnecting = false;
      console.error('⚠️ Failed to connect to RabbitMQ:', error);
      await this.handleReconnect();
      throw error;
    }
  }

  private async setupQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    console.log('\n Setting up RabbitMQ queues...');

    // Setup Dead Letter Queue (DLQ)
    await this.channel.assertQueue(this.config.queues.rewardDLQ, {
      durable: true,
      arguments: {
        'x-message-ttl': 86400000, // time for a message to exist in the queue - 1 day
        'x-max-length': 1000, // this queue hold 100 message maximum
      },
    });
    console.log(`   ✅ DLQ created: ${this.config.queues.rewardDLQ}`);

    // Setup Main Reward Queue
    await this.channel.assertQueue(this.config.queues.rewardQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': this.config.queues.rewardDLQ,
        'x-message-ttl': 3600000,
      },
    });
    console.log(`   ✅ Main queue created: ${this.config.queues.rewardQueue}`);
  }

  public getChannel(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized. Call connect() first.');
    }
    return this.channel;
  }

  public getQueues() {
    return this.config.queues;
  }

  private handleConnectionError(): void {
    this.connection = null;
    this.channel = null;
    this.handleReconnect();
  }

  private handleConnectionClose(): void {
    this.connection = null;
    this.channel = null;
    this.handleReconnect();
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`⚠️ Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(` Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts}) in ${delay}ms...`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('⚠️ Reconnection failed:', error);
      }
    }, delay);
  }

  public async close(): Promise<void> {
    console.log(' Closing RabbitMQ connection...');

    try {
      if (this.channel) {
        await this.channel.close();
        console.log('✅ Channel closed');
      }

      if (this.connection) {
        await this.connection.close();
        console.log('✅ Connection closed');
      }

      this.channel = null;
      this.connection = null;

    } catch (error) {
      console.error('⚠️ Error closing RabbitMQ connection:', error);
    }
  }

  public isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  public getStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    config: RabbitMQConfig;
  } {
    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      config: this.config,
    };
  }
}

export async function initializeRabbitMQ(): Promise<void> {
  const rabbitMQ = RabbitMQConnection.getInstance();
  await rabbitMQ.connect();
}

export function getRabbitMQ(): RabbitMQConnection {
  return RabbitMQConnection.getInstance();
}