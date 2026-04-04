import mongoose from 'mongoose';
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import { MarketplaceItem } from '../models/MarketplaceItem';
import { PlayerBalance } from '../models/playerBalance';
import { config } from '../configs/unifiedConfig';
import { MarketService } from '../services/market.service';
import { BlockchainService } from '../services/blockchain.service';
import { getRabbitMQ, initializeRabbitMQ } from '../configs/rabbitmq';
import { postgresPrisma } from '../configs/prismaClient';
import { GameRewardHandler } from '../services/gameRewardHandler';
import { StockfishService } from '../services/stockfish.service';
import Web3 from 'web3';
import fs from 'fs';
import path from 'path';

const logFile = path.join(process.cwd(), 'verify-log.txt');
fs.writeFileSync(logFile, '--- Starting Verification Log ---\n');

function log(msg: string, ...args: any[]) {
    const text = msg + ' ' + args.map(a => JSON.stringify(a)).join(' ') + '\n';
    console.log(msg, ...args);
    fs.appendFileSync(logFile, text);
}

async function verify() {
    log('--- Starting Verification Script ---');
    
    try {
        // 1. Connect to Mongo
        await mongoose.connect(config.db.mongodb.uri, { dbName: config.db.mongodb.dbName });
        log('✅ MongoDB connected');

        // 2. Setup Services
        const rabbitMQ = getRabbitMQ();
        const blockchainService = new BlockchainService();
        const marketService = new MarketService(postgresPrisma, blockchainService, rabbitMQ);
        const stockfishService = new StockfishService();

        // 3. Test AI Analysis (Stockfish)
        log('\n--- Testing AI Analysis (Stockfish) ---');
        const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        const move: any = { from: 'e2', to: 'e4' };
        try {
            const analysis = await stockfishService.analyzeAndClassifyMove(fen, move, 1);
            log('✅ Stockfish analysis succeeded:', analysis.classification);
        } catch (e: any) {
            log('❌ Stockfish analysis failed:', e.message);
        }

        // 4. Test User & Content Setup
        const testUserId = '00260fb1-481d-43f9-9629-2835172509c0';
        
        // Ensure user has balance for purchase test
        let balance = await PlayerBalance.findOne({ userId: testUserId });
        if (!balance) {
            log('Creating mock balance for test user...');
            balance = await PlayerBalance.create({
                userId: testUserId,
                walletAddress: '0xbfB4CeE50920E6af7a2ff3e65F4455B6381C3e78',
                balance: Web3.utils.toWei('100', 'ether'),
                pendingBalance: '0'
            });
        } else {
            // Update balance to ensure they can afford test items
            await PlayerBalance.updateOne(
                { userId: testUserId }, 
                { $set: { balance: Web3.utils.toWei('500', 'ether') } }
            );
        }
        log('✅ Test user balance confirmed');

        // Ensure there is an item to buy
        let item = await MarketplaceItem.findOne({ isActive: true });
        if (!item) {
            log('Creating mock marketplace item...');
            item = await MarketplaceItem.create({
                name: 'Test NFT Skin',
                description: 'A test skin for verification',
                imageUrl: 'http://example.com/image.png',
                rarity: 'EPIC',
                dynasty: 'Đinh',
                price: 10,
                quantity: 100,
                category: 'SKIN'
            });
        } else {
            await MarketplaceItem.updateOne({ _id: (item as any)._id }, { $set: { quantity: 100 } });
        }
        log('✅ Test item confirmed:', item.name);

        // 5. Test NFT Purchase Flow
        log('\n--- Testing NFT Purchase Flow ---');
        try {
            await initializeRabbitMQ();
            log('✅ RabbitMQ initialized');
        } catch (e: any) {
            log('⚠️ RabbitMQ init failed (maybe not running?), error:', e.message);
        }

        const buyResult = await marketService.buyItem(testUserId, {
            itemId: (item as any)._id.toString(),
            quantity: 1
        });
        log('✅ MarketService.buyItem triggered:', buyResult.message);

        // 6. Test Game Rewards Flow
        log('\n--- Testing Game Rewards Flow ---');
        const mockGameSession: any = {
            gameId: 'verify-game-' + Date.now(),
            winner: testUserId,
            status: 'finished',
            result: '1-0',
            endTime: new Date(),
            whitePlayerId: testUserId,
            blackPlayerId: 'opponent-id'
        };

        await GameRewardHandler.handleGameEnd(mockGameSession);
        log('✅ GameRewardHandler.handleGameEnd triggered successfully');

        // 7. Wait for worker to process
        log('\n--- Waiting for background worker to process (10s) ---');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 8. Verify Worker Success in MongoDB
        log('\n--- Final Verification in MongoDB ---');
        
        const finalBalance = await PlayerBalance.findOne({ userId: testUserId });
        log('Final Balance Record:', {
            balance: finalBalance?.balance,
            pendingBalance: finalBalance?.pendingBalance,
            txCount: finalBalance?.pendingTransactions?.length
        });

        const rewardRecord = await mongoose.model('GameReward').findOne({ gameSessionId: mockGameSession.gameId });
        log('Reward Record Status:', {
            confirmed: rewardRecord?.confirmed,
            txHash: rewardRecord?.transactionHash
        });

        if (rewardRecord?.transactionHash) {
            log('✅ SUCCESS: Worker processed the game reward and hit the blockchain!');
        } else {
            log('⚠️ Worker has not processed the reward yet. Check if pnpm run worker is healthy.');
        }

        log('\n--- Verification Script Completed ---');

    } catch (error: any) {
        log('❌ Verification failed:', error.message);
        if (error.stack) log(error.stack);
    } finally {
        await mongoose.disconnect();
        await postgresPrisma.$disconnect();
        process.exit(0);
    }
}

verify();
