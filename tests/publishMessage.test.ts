// scripts/testPublishMessage.ts

import { config } from 'dotenv';
import { initializeRabbitMQ, getRabbitMQ } from '../src/configs/rabbitmq.ts';
import { RewardPublisher, RewardMessage } from '../src/queues/publishers/reward.publisher.ts';
import { postgresPrisma } from '../src/configs/prismaClient.ts';
import mongoose from 'mongoose';
import Web3 from 'web3';

/**
 * TEST SCRIPT: Publish Reward Message
 * 
 * USAGE:
 * npx tsx tests/publishMessage.test.ts
 */

config();

async function testPublishMessage(): Promise<void> {

  try {
    // Step 1: Connect to databases
    console.log('\n STEP 1: Connecting to databases...');
    
    await postgresPrisma.$connect();
    console.log('   ✅ PostgreSQL connected');

    const mongoUrl = process.env.MONGODB_URL;
    const mongoDb = process.env.MONGODB_DB;
    let connectionString = `${mongoUrl}${mongoDb}`;
    
    await mongoose.connect(connectionString);
    console.log('   ✅ MongoDB connected');

    // Step 2: Initialize RabbitMQ
    console.log('\n STEP 2: Initializing RabbitMQ...');
    await initializeRabbitMQ();
    console.log('   ✅ RabbitMQ connected');

    // Step 3: Get test user (the one with wallet address)
    console.log('\n STEP 3: Finding test user...');
    const testUser = await postgresPrisma.users.findUnique({
      where: { email: 'chaunguyenwork01@gmail.com' }
    });

    if (!testUser) {
      throw new Error('Test user not found! Please check email in .env');
    }

    if (!testUser.walletAddress) {
      throw new Error('Test user has no wallet address!');
    }

    console.log('   ✅ Test user found:');
    console.log(`      Username: ${testUser.username}`);
    console.log(`      Email: ${testUser.email}`);
    console.log(`      Wallet: ${testUser.walletAddress}`);
    console.log(`      ELO: ${testUser.elo}`);

    // Step 4: Create mock game reward in MongoDB
    console.log('\n STEP 4: Creating mock game reward...');
    
    const { GameReward } = await import('../src/models/gameRewards');
    
    const mockGameId = `test-game-${Date.now()}`;
    const rewardAmount = Web3.utils.toWei('10', 'ether'); // 10 GameCoins for PvP
    
    const gameReward = new GameReward({
      gameSessionId: mockGameId,
      winnerId: testUser.id,
      winnerWallet: testUser.walletAddress,
      rewardAmount,
      matchType: 'PvP',
      gameResult: '1-0',
      gameEndTime: new Date(),
      confirmed: false
    });

    const savedReward = await gameReward.save();
    const gameRewardId = savedReward._id?.toString() || '';
    
    console.log('   ✅ GameReward created:');
    console.log(`      ID: ${gameRewardId}`);
    console.log(`      Game: ${mockGameId}`);
    console.log(`      Amount: ${Web3.utils.fromWei(rewardAmount, 'ether')} GC`);

    // Step 5: Create reward message
    console.log('\n STEP 5: Creating reward message...');
    
    const rewardMessage: RewardMessage = {
      userId: testUser.id,
      username: testUser.username,
      walletAddress: testUser.walletAddress,
      amount: rewardAmount,
      gameId: mockGameId,
      matchType: 'PvP',
      gameRewardId: gameRewardId,
      timestamp: new Date(),
      transactionType: 'reward',
      metadata: {
        gameResult: '1-0',
        gameEndTime: new Date()
      }
    };

    console.log('   ✅ Message created:');
    console.log(`      User: ${rewardMessage.username}`);
    console.log(`      Amount: ${Web3.utils.fromWei(rewardMessage.amount, 'ether')} GC`);
    console.log(`      Wallet: ${rewardMessage.walletAddress}`);

    // Step 6: Publish message to RabbitMQ
    console.log('\n STEP 6: Publishing message to RabbitMQ...');
    
    const published = await RewardPublisher.publishReward(rewardMessage);
    
    if (published) {
      console.log('   ✅ Message published successfully!');
    } else {
      console.log('   ⚠️  Message buffered (queue full)');
    }

    // Step 7: Verify message in queue
    console.log('\n STEP 7: Verifying message in queue...');
    
    const rabbitmq = getRabbitMQ();
    const channel = rabbitmq.getChannel();
    const queues = rabbitmq.getQueues();
    
    const queueInfo = await channel.checkQueue(queues.rewardQueue);
    
    console.log('   ✅ Queue status:');
    console.log(`      Queue: ${queues.rewardQueue}`);
    console.log(`      Messages: ${queueInfo.messageCount}`);
    console.log(`      Consumers: ${queueInfo.consumerCount}`);

    if (queueInfo.messageCount > 0) {
      console.log('\n   ✅ SUCCESS! Message is in the queue!');
    } else {
      console.log('\n   ⚠️  WARNING: No messages in queue (might have been consumed)');
    }

  } catch (error) {
    console.error('\n⚠️ Test failed:');
    console.error(error);
    throw error;
  } finally {
    // Cleanup
    await postgresPrisma.$disconnect();
    await mongoose.disconnect();
    
    const rabbitmq = getRabbitMQ();
    await rabbitmq.close();
    
    console.log('✅ Connections closed\n');
  }
}

// Run the test (ESM compatible)
testPublishMessage()
  .then(() => {
    console.log('✅ Test script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('⚠️ Test script failed:', error);
    process.exit(1);
  });

export { testPublishMessage };