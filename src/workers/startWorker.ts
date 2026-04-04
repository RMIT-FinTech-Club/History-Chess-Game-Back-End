import { config } from '../configs/unifiedConfig.ts';
import mongoose from 'mongoose';
import { initializeRabbitMQ } from '../configs/rabbitmq.ts';
import { getBlockchainWorker } from './blockchain.worker';
import { startStockfishWorker } from '../queues/workers/stockfish.worker';

/**
 * 
 * USAGE:
 * npx tsx src/workers/startWorker.ts
 */

async function startWorker(): Promise<void> {
  console.log('\n Starting All Background Workers...\n');
  console.log('='.repeat(80));

  try {
    // Step 1: Connect to MongoDB
    await mongoose.connect(config.db.mongodb.uri, { dbName: config.db.mongodb.dbName });
    console.log('✅ MongoDB connected');

    // Step 2: Initialize RabbitMQ
    await initializeRabbitMQ();
    console.log('✅ RabbitMQ connected\n');

    // Step 3: Start workers
    const blockchainWorker = getBlockchainWorker();
    await blockchainWorker.start();
    await startStockfishWorker();

    console.log('\n' + '='.repeat(80));
    console.log('✅ WORKERS ARE NOW RUNNING');
    console.log('='.repeat(80) + '\n');

    // Handle shutdown with Ctrl+C
    process.on('SIGINT', async () => {
      await blockchainWorker.stop();
      await mongoose.disconnect();
      console.log('✅ Workers shutdown complete\n');
      process.exit(0);
    });

	// Handle shutdown when system stop
    process.on('SIGTERM', async () => {
      await blockchainWorker.stop();
      await mongoose.disconnect();
      console.log('✅ Workers shutdown complete\n');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n⚠️ Failed to start workers:');
    console.error(error);
    process.exit(1);
  }
}

// Start the worker
startWorker();