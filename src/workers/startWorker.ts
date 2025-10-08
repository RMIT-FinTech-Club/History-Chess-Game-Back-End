import { config } from 'dotenv';
import mongoose from 'mongoose';
import { initializeRabbitMQ } from '../configs/rabbitmq.ts';
import { getBlockchainWorker } from './blockchain.worker';

/**
 * 
 * USAGE:
 * npx tsx src/workers/startWorker.ts
 */

config();

async function startWorker(): Promise<void> {
  console.log('\n Starting Blockchain Reward Worker...\n');
  console.log('='.repeat(80));

  try {
    // Step 1: Connect to MongoDB
    const mongoUrl = process.env.MONGODB_URL;
    const mongoDb = process.env.MONGODB_DB;
    const connectionString = `${mongoUrl}${mongoDb}`;
    
    await mongoose.connect(connectionString);
    console.log('✅ MongoDB connected\n');

    // Step 2: Initialize RabbitMQ
    await initializeRabbitMQ();
    console.log('✅ RabbitMQ connected\n');

    // Step 3: Start worker
    const worker = getBlockchainWorker();
    await worker.start();

    console.log('\n' + '='.repeat(80));
    console.log('✅ WORKER IS NOW RUNNING');
    console.log('='.repeat(80) + '\n');

    // Handle shutdown with Ctrl+C
    process.on('SIGINT', async () => {
      
      await worker.stop();
      await mongoose.disconnect();
      
      console.log('✅ Worker shutdown complete\n');
      process.exit(0);
    });

	// Handle shutdown when system stop
    process.on('SIGTERM', async () => {
      await worker.stop();
      await mongoose.disconnect();
      
      console.log('✅ Worker shutdown complete\n');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n⚠️ Failed to start worker:');
    console.error(error);
    process.exit(1);
  }
}

// Start the worker
startWorker();