import mongoose from 'mongoose';
import { config } from '../configs/unifiedConfig';

async function checkFailures() {
    try {
        await mongoose.connect(config.db.mongodb.uri, { dbName: config.db.mongodb.dbName });
        const db = mongoose.connection.db;
        const failures = await db?.collection('failedblockchaintransactions').find().sort({ firstAttemptAt: -1 }).limit(5).toArray();
        console.log('--- Last 5 Failed Transactions ---');
        console.log(JSON.stringify(failures, null, 2));

        const pendingRewards = await mongoose.model('GameReward').find({ confirmed: false }).sort({ createdAt: -1 }).limit(5).toArray?.() || 
                               await mongoose.model('GameReward').find({ confirmed: false }).sort({ createdAt: -1 }).limit(5);
        console.log('\n--- Last 5 Unconfirmed Rewards ---');
        console.log(JSON.stringify(pendingRewards, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

checkFailures();
