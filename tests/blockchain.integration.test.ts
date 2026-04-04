import { BlockchainService } from '../src/services/blockchain.service';
import mongoose from 'mongoose';
import { GameReward } from '../src/models/gameRewards';
import { PlayerBalance } from '../src/models/playerBalance';
import dotenv from 'dotenv';
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import Web3 from 'web3';

import path from 'path';

// Load environment variables explicitly
dotenv.config({ path: path.resolve(__dirname, '../.env') });

describe('Blockchain Integration Tests', () => {
    let blockchainService: BlockchainService;
    let testWinnerWallet: string;
    let testWinnerId: string;
    let mockGameRewardId: string;

    beforeAll(async () => {
        // Connect to MongoDB
        const mongoUrl = process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://localhost:27017';
        const dbName = process.env.MONGODB_DB || 'ftc_history_chess_game';
        
        // ensure valid connection string
        let connString = mongoUrl;
        if (!mongoUrl.includes('+srv') && !mongoUrl.endsWith(dbName)) {
            connString = mongoUrl.endsWith('/') ? `${mongoUrl}${dbName}` : `${mongoUrl}/${dbName}`;
        }
        
        await mongoose.connect(connString, { dbName: dbName });
        
        blockchainService = new BlockchainService();
        testWinnerWallet = '0x1234567890123456789012345678901234567890'; // Valid length format
        testWinnerId = 'test-user-id-' + Date.now();
        mockGameRewardId = new mongoose.Types.ObjectId().toString();

        // Create initial PlayerBalance record
        await PlayerBalance.create({
            userId: testWinnerId,
            walletAddress: testWinnerWallet.toLowerCase(),
            balance: '0',
            pendingBalance: '0',
            version: 1,
            pendingTransactions: [],
            lastSyncedBlock: 0,
            needsSync: false
        });

        // Create initial GameReward record
        await GameReward.create({
            _id: mockGameRewardId,
            gameSessionId: 'test-session-' + Date.now(),
            winnerId: testWinnerId,
            winnerWallet: testWinnerWallet,
            matchType: 'PvP',
            rewardAmount: '10000000000000000000', // 10 tokens
            status: 'processing',
            gameEndTime: new Date(),
            gameResult: 'win',
            createdAt: new Date()
        });
    });

    afterAll(async () => {
        // Cleanup Test Data
        await PlayerBalance.deleteMany({ userId: testWinnerId });
        await GameReward.deleteMany({ _id: mockGameRewardId });
        await mongoose.connection.close();
    });

    jest.setTimeout(30000); // 30 seconds timeout to allow blockchain mining logic

    it('should successfully process a GameReward transaction on the local Besu Node', async () => {
        const gameReward = await GameReward.findById(mockGameRewardId);
        
        // Push a dummy pending transaction before testing the process so it can update it
        await PlayerBalance.updateOne(
            { userId: testWinnerId },
            {
                $push: {
                    pendingTransactions: {
                        transactionHash: `pending-${mockGameRewardId}`,
                        amount: gameReward!.rewardAmount,
                        type: 'PvP',
                        status: 'pending',
                        createdAt: new Date()
                    }
                }
            }
        );

        // Execute the blockchain logic!
        await blockchainService.processGameReward(gameReward);

        // Assert 1: The Transaction Hash was Saved successfully in MongoDB!
        const updatedReward = await GameReward.findById(mockGameRewardId);
        expect(updatedReward!.transactionHash).toBeDefined();
        expect(updatedReward!.transactionHash!.startsWith('0x')).toBe(true);

        // Assert 2: The Player Balance correctly updated the pending transaction!
        const updatedBalance = await PlayerBalance.findOne({ userId: testWinnerId });
        const realPendingTx = updatedBalance!.pendingTransactions.find(
            tx => tx.transactionHash === updatedReward!.transactionHash
        );

        expect(realPendingTx).toBeDefined();
        expect(realPendingTx!.status).toBe('pending');
        
        // Assert 3: We can actually fetch the physical blockchain balance from Besu RPC
        const realChainBalance = await blockchainService.getBlockchainBalance(testWinnerWallet);
        expect(Number(realChainBalance)).toBeGreaterThan(0);
        
        console.log(`Verified Chain Balance for ${testWinnerWallet}: ${Web3.utils.fromWei(realChainBalance, 'ether')} Coins`);
    });
});
