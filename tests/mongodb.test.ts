// tests/mongodbInspection.test.ts
import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

async function inspectMongoDB(): Promise<void> {
  console.log(' MongoDB Database Inspection...\n');

  try {
    // Connect to MongoDB
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
    const mongoDb = process.env.MONGODB_DB || 'ftc_history_chess_game';
    
    let connectionString: string;
    if (mongoUrl.endsWith('/')) {
      connectionString = `${mongoUrl}${mongoDb}`;
    } else if (mongoUrl.split('/').length > 3) {
      connectionString = mongoUrl;
    } else {
      connectionString = `${mongoUrl}/${mongoDb}`;
    }
    
    await mongoose.connect(connectionString);
    console.log('✅ Connected to MongoDB Atlas');
    console.log(`📦 Database: ${mongoose.connection.db?.databaseName}\n`);

    // 1. List all collections
    console.log('📋 Available Collections:');
    const collections = await mongoose.connection.db?.listCollections().toArray();
    collections?.forEach((collection, index) => {
      console.log(`   ${index + 1}. ${collection.name}`);
    });
    console.log('');

    // 2. Import and check GameReward model
    console.log('🎮 GameReward Collection Inspection:');
    try {
      const { GameReward } = await import('../src/models/gameRewards.ts');
      
      // Count total documents
      const totalRewards = await GameReward.countDocuments();
      console.log(`   Total GameReward documents: ${totalRewards}`);
      
      if (totalRewards > 0) {
        // Show recent rewards (last 10)
        const recentRewards = await GameReward.find()
          .sort({ gameEndTime: -1 })
          .limit(10)
          .lean();
        
        console.log(`   Recent GameRewards (last ${Math.min(10, recentRewards.length)}):`);
        recentRewards.forEach((reward, index) => {
          console.log(`   ${index + 1}. Game: ${reward.gameSessionId}`);
          console.log(`      Winner: ${reward.winnerId}`);
          console.log(`      Type: ${reward.matchType}`);
          console.log(`      Amount: ${reward.rewardAmount} wei`);
          console.log(`      Transaction: ${reward.transactionHash || 'Not set'}`);
          console.log(`      Block: ${reward.blockNumber || 'Not set'}`);
          console.log(`      Confirmed: ${reward.confirmed}`);
          console.log(`      Created: ${reward.gameEndTime}`);
          console.log('');
        });

        // Check for test rewards specifically
        const testRewards = await GameReward.find({
          gameSessionId: { $regex: /^test-/ }
        }).lean();
        
        console.log(`   Test GameRewards found: ${testRewards.length}`);
        if (testRewards.length > 0) {
          testRewards.forEach((reward, index) => {
            console.log(`   Test ${index + 1}: ${reward.gameSessionId} - ${reward.transactionHash || 'No TX'}`);
          });
        }
      } else {
        console.log('   ❌ No GameReward documents found');
      }
    } catch (error) {
      console.log(`   ❌ Error loading GameReward model: ${error}`);
    }
    console.log('');

    // 3. Check PlayerBalance collection
    console.log('👤 PlayerBalance Collection Inspection:');
    try {
      const { PlayerBalance } = await import('../src/models/playerBalance.ts');
      
      const totalBalances = await PlayerBalance.countDocuments();
      console.log(`   Total PlayerBalance documents: ${totalBalances}`);
      
      if (totalBalances > 0) {
        const recentBalances = await PlayerBalance.find()
          .sort({ lastUpdated: -1 })
          .limit(10)
          .lean();
        
        console.log(`   Recent PlayerBalances (last ${Math.min(10, recentBalances.length)}):`);
        recentBalances.forEach((balance, index) => {
          console.log(`   ${index + 1}. User: ${balance.userId}`);
          console.log(`      Wallet: ${balance.walletAddress || 'Not set'}`);
          console.log(`      Confirmed: ${balance.balance} wei`);
          console.log(`      Pending: ${balance.pendingBalance} wei`);
          console.log(`      Pending TXs: ${balance.pendingTransactions?.length || 0}`);
          console.log(`      Last Updated: ${balance.lastUpdated}`);
          console.log('');
        });

        // Check for test users
        const testBalances = await PlayerBalance.find({
          userId: { $regex: /^test-/ }
        }).lean();
        
        console.log(`   Test PlayerBalances found: ${testBalances.length}`);
        if (testBalances.length > 0) {
          testBalances.forEach((balance, index) => {
            console.log(`   Test ${index + 1}: ${balance.userId} - Pending: ${balance.pendingBalance} wei`);
          });
        }
      } else {
        console.log('   ❌ No PlayerBalance documents found');
      }
    } catch (error) {
      console.log(`   ❌ Error loading PlayerBalance model: ${error}`);
    }
    console.log('');

    // 4. Check other collections that might exist
    console.log('🔍 Other Collections Inspection:');
    const otherCollections = ['failedblockchaintransactions', 'gamesessions', 'users'];
    
    for (const collectionName of otherCollections) {
      try {
        const collection = mongoose.connection.db?.collection(collectionName);
        const count = await collection?.countDocuments();
        console.log(`   ${collectionName}: ${count || 0} documents`);
        
        if (count && count > 0 && count <= 5) {
          const docs = await collection?.find().limit(3).toArray();
          docs?.forEach((doc, index) => {
            console.log(`     ${index + 1}. ${JSON.stringify(doc, null, 2).substring(0, 200)}...`);
          });
        }
      } catch (error) {
        console.log(`   ${collectionName}: Error checking - ${error}`);
      }
    }

    // 5. Check for recent transactions by timestamp
    console.log('\n Recent Database Activity (last hour):');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    try {
      const { GameReward } = await import('../src/models/gameRewards.ts');
      const recentGameRewards = await GameReward.find({
        gameEndTime: { $gte: oneHourAgo }
      }).lean();
      
      console.log(`   GameRewards in last hour: ${recentGameRewards.length}`);
      
      const { PlayerBalance } = await import('../src/models/playerBalance.ts');
      const recentBalanceUpdates = await PlayerBalance.find({
        lastUpdated: { $gte: oneHourAgo }
      }).lean();
      
      console.log(`   PlayerBalance updates in last hour: ${recentBalanceUpdates.length}`);
      
      if (recentGameRewards.length > 0 || recentBalanceUpdates.length > 0) {
        console.log('   ✅ Recent activity detected!');
      } else {
        console.log('No recent activity in the last hour');
        console.log('This might indicate the test data is not being saved');
      }
    } catch (error) {
      console.log(`   Error checking recent activity: ${error}`);
    }

  } catch (error) {
    console.error('❌ MongoDB inspection failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n MongoDB connection closed');
  }
}

// Run the inspection
inspectMongoDB().catch(error => {
  console.error(' MongoDB inspection crashed:', error);
  process.exit(1);
});