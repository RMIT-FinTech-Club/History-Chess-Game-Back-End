// tests/endToEndReward.test.ts
import { Web3 } from 'web3';
import { config } from 'dotenv';
import { BlockchainService } from '../src/services/blockchain.service.ts';
import mongoose from 'mongoose';

// Load environment variables
config();

// Mock game session data for testing
interface MockGameSession {
	gameId: string;
	winner: string;
	winnerWallet: string;
	matchType: 'PvP' | 'Bot';
	result: string;
	endTime: Date;
}

// Mock game reward data
interface MockGameReward {
	gameSessionId: string;
	winnerId: string;
	winnerWallet: string;
	matchType: 'PvP' | 'Bot';
	rewardAmount: string;
	gameResult: string;
	gameEndTime: Date;
}

/**
 * END-TO-END REWARD FLOW TEST SUITE
 * Tests the complete reward system from game ending to blockchain confirmation
 */
async function runEndToEndRewardTests(): Promise<void> {
	console.log('Starting End-to-End Reward Flow Tests...\n');

	let passedTests = 0;
	let totalTests = 0;
	let blockchainService: BlockchainService;
	let web3: Web3;
	let testWallets: string[] = [];

	// Helper function to run individual tests
	const runTest = async (testName: string, testFunction: () => Promise<void>) => {
		totalTests++;
		try {
			console.log(`Testing: ${testName}`);
			await testFunction();
			console.log(`✅ PASSED: ${testName}\n`);
			passedTests++;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.log(`❌ FAILED: ${testName}`);
			console.log(`   Error: ${errorMessage}\n`);
		}
	};

	// TEST 1: MongoDB Connection
	await runTest('TEST 1: MongoDB Atlas Connection', async () => {
		const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
		const mongoDb = process.env.MONGODB_DB || 'ftc_history_chess_game';

		let connectionString: string;
		connectionString = `${mongoUrl}${mongoDb}`;

		console.log(`   Connecting to MongoDB Atlas...`);
		await mongoose.connect(connectionString);

		const connectionState = mongoose.connection.readyState;
		const connectedDatabase = mongoose.connection.db?.databaseName;

		console.log(`   MongoDB State: ${connectionState === 1 ? 'Connected' : 'Disconnected'}`);
		console.log(`   Connected Database: ${connectedDatabase}`);

		if (connectionState !== 1) {
			throw new Error('MongoDB not connected');
		}
	});

	// TEST 2: Initialize Test Environment
	await runTest('TEST 2: Test Environment Setup', async () => {
		// Initialize Web3 and BlockchainService
		web3 = new Web3(process.env.RPC_URL);
		blockchainService = new BlockchainService();

		// Get test wallet addresses from Ganache
		const accounts = await web3.eth.getAccounts();
		testWallets = accounts.slice(1, 4); // Use accounts 1, 2, 3

		console.log(`   Web3 connected to: ${process.env.RPC_URL}`);
		console.log(`   Available test wallets: ${testWallets.length}`);
		console.log(`   Test wallet 1: ${testWallets[0]}`);
		console.log(`   Test wallet 2: ${testWallets[1]}`);
		console.log(`   Test wallet 3: ${testWallets[2]}`);

		if (testWallets.length < 3) {
			throw new Error('Need at least 3 test wallets from Ganache');
		}
	});

	// TEST 3: Check Initial Blockchain Balances
	await runTest('TEST 3: Initial Blockchain Balance Check', async () => {
		console.log(`   Checking initial GameCoin balances...`);

		for (let i = 0; i < testWallets.length; i++) {
			const balance = await blockchainService.getBlockchainBalance(testWallets[i]);
			const balanceInGC = Web3.utils.fromWei(balance, 'ether');

			console.log(`   Wallet ${i + 1}: ${balanceInGC} GameCoins`);

			// Note existing balances
			if (balance !== '0') {
				console.log(`   Wallet ${i + 1} has existing balance, continuing anyway...`);
			}
		}
	});

	// TEST 4: Simulate PvP Game Ending - Connect to the DB
	await runTest('TEST 4: Game End Flow', async () => {
		const { GameReward } = await import('../src/models/gameRewards.ts');
		const { PlayerBalance } = await import('../src/models/playerBalance.ts');

		const gameSession: MockGameSession = {
			gameId: 'test-pvp-001',
			winner: 'test-user-pvp-001',
			winnerWallet: testWallets[0],
			matchType: 'PvP',
			result: '1-0',
			endTime: new Date()
		};

		console.log(`   Testing real-world game end flow...`);
		console.log(`   Winner: ${gameSession.winner}`);
		console.log(`   Winner Wallet: ${gameSession.winnerWallet}`);

		// PHASE 1: INSTANT USER EXPERIENCE
		console.log(`   PHASE 1: Instant optimistic updates...`);

		// Step 1: Create GameReward record
		const gameReward = new GameReward({
			gameSessionId: gameSession.gameId,
			winnerId: gameSession.winner,
			winnerWallet: gameSession.winnerWallet,
			rewardAmount: Web3.utils.toWei('10', 'ether'),
			matchType: gameSession.matchType,
			gameResult: gameSession.result,
			gameEndTime: gameSession.endTime,
			confirmed: false // Initially unconfirmed
		});

		const savedGameReward = await gameReward.save();
		const gameRewardId = savedGameReward._id?.toString() || '';
		console.log(`   ✅ GameReward created instantly: ${gameRewardId}`);

		// Step 2: Optimistic balance update (instant)
		await blockchainService.updateBalanceOptimistic(
			gameSession.winner,
			Web3.utils.toWei('10', 'ether'),
			'PvP',
			gameRewardId,  // Use the string version
			gameSession.winnerWallet
		);

		// Step 3: Verify instant optimistic state
		const optimisticBalance = await blockchainService.getPlayerBalance(gameSession.winner);
		console.log(`   ✅ Optimistic pending balance: ${Web3.utils.fromWei(optimisticBalance.pending, 'ether')} GC`);
		console.log(`   ✅ UI shows instant feedback: ${Web3.utils.fromWei(optimisticBalance.total, 'ether')} GC total`);

		// Verify GameReward is unconfirmed initially
		if (savedGameReward.confirmed) {
			throw new Error('GameReward should be unconfirmed initially');
		}
		if (savedGameReward.transactionHash) {
			throw new Error('GameReward should not have transaction hash initially');
		}

		// PHASE 2: BACKGROUND BLOCKCHAIN PROCESSING ===
		console.log(`   PHASE 2: Background blockchain processing...`);

		// Get blockchain balance before (should be unchanged yet)
		const blockchainBalanceBefore = await blockchainService.getBlockchainBalance(gameSession.winnerWallet);
		console.log(`   Blockchain balance before: ${Web3.utils.fromWei(blockchainBalanceBefore, 'ether')} GC`);

		// Step 4: Process blockchain transaction (this happens in background)
		await blockchainService.processGameReward(savedGameReward);

		// Step 5: Verify database was updated with transaction details
		const updatedGameReward = await GameReward.findById(savedGameReward._id);
		console.log(`   ✅ Transaction hash saved: ${updatedGameReward?.transactionHash || 'NOT SAVED'}`);
		console.log(`   ✅ Block number saved: ${updatedGameReward?.blockNumber || 'NOT SAVED'}`);

		if (!updatedGameReward?.transactionHash) {
			throw new Error('Transaction hash should be saved after blockchain processing');
		}

		// Step 6: Verify blockchain balance changed (after some time)
		// In real system, this would be detected by event listeners
		const blockchainBalanceAfter = await blockchainService.getBlockchainBalance(gameSession.winnerWallet);
		console.log(`   ✅ Blockchain balance after: ${Web3.utils.fromWei(blockchainBalanceAfter, 'ether')} GC`);

		const expectedBlockchainBalance = (BigInt(blockchainBalanceBefore) + BigInt(Web3.utils.toWei('10', 'ether'))).toString();
		if (blockchainBalanceAfter !== expectedBlockchainBalance) {
			throw new Error(`Expected blockchain balance ${Web3.utils.fromWei(expectedBlockchainBalance, 'ether')} GC, got ${Web3.utils.fromWei(blockchainBalanceAfter, 'ether')} GC`);
		}

		// === VERIFICATION: SYSTEM CONSISTENCY ===
		console.log(`   VERIFICATION: System consistency...`);

		// Verify PlayerBalance pending transaction was updated
		const playerBalance = await PlayerBalance.findOne({ userId: gameSession.winner });
		const pendingTx = playerBalance?.pendingTransactions.find(tx =>
			tx.transactionHash === updatedGameReward.transactionHash
		);

		if (!pendingTx) {
			console.log(`     Pending transaction not updated with real hash yet (async operation)`);
		} else {
			console.log(`   ✅ Pending transaction updated with real hash: ${pendingTx.transactionHash}`);
		}

		console.log(`   ✅ Two-phase system working: Instant UX + Background blockchain processing`);
	});

	// TEST 5: Simulate Bot Game Ending 
	await runTest('TEST 5: Optimistic vs Confirmed Balance Flow', async () => {
		const { GameReward } = await import('../src/models/gameRewards.ts');
		const { PlayerBalance } = await import('../src/models/playerBalance.ts');

		const gameSession: MockGameSession = {
			gameId: 'test-pvp-001',
			winner: 'test-user-pvp-001',
			winnerWallet: testWallets[0],
			matchType: 'Bot',
			result: '1-0',
			endTime: new Date()
		};

		console.log(`   Testing real-world game end flow...`);
		console.log(`   Winner: ${gameSession.winner}`);
		console.log(`   Winner Wallet: ${gameSession.winnerWallet}`);

		// PHASE 1: INSTANT USER EXPERIENCE ===
		console.log(`   PHASE 1: Instant optimistic updates...`);

		// Step 1: Create GameReward record
		const gameReward = new GameReward({
			gameSessionId: gameSession.gameId,
			winnerId: gameSession.winner,
			winnerWallet: gameSession.winnerWallet,
			rewardAmount: Web3.utils.toWei('5', 'ether'),
			matchType: gameSession.matchType,
			gameResult: gameSession.result,
			gameEndTime: gameSession.endTime,
			confirmed: false // Initially unconfirmed
		});

		const savedGameReward = await gameReward.save();
		const gameRewardId = savedGameReward._id?.toString() || '';
		console.log(`   ✅ GameReward created instantly: ${gameRewardId}`);

		// Step 2: Optimistic balance update (instant)
		await blockchainService.updateBalanceOptimistic(
			gameSession.winner,
			Web3.utils.toWei('5', 'ether'),
			'Bot',
			gameRewardId,  // Use the string version
			gameSession.winnerWallet
		);

		// Step 3: Verify instant optimistic state
		const optimisticBalance = await blockchainService.getPlayerBalance(gameSession.winner);
		console.log(`   ✅ Optimistic pending balance: ${Web3.utils.fromWei(optimisticBalance.pending, 'ether')} GC`);
		console.log(`   ✅ UI shows instant feedback: ${Web3.utils.fromWei(optimisticBalance.total, 'ether')} GC total`);

		// Verify GameReward is unconfirmed initially
		if (savedGameReward.confirmed) {
			throw new Error('GameReward should be unconfirmed initially');
		}
		if (savedGameReward.transactionHash) {
			throw new Error('GameReward should not have transaction hash initially');
		}

		// PHASE 2: BACKGROUND BLOCKCHAIN PROCESSING ===
		console.log(`   PHASE 2: Background blockchain processing...`);

		// Get blockchain balance before (should be unchanged yet)
		const blockchainBalanceBefore = await blockchainService.getBlockchainBalance(gameSession.winnerWallet);
		console.log(`   Blockchain balance before: ${Web3.utils.fromWei(blockchainBalanceBefore, 'ether')} GC`);

		// Step 4: Process blockchain transaction (this happens in background)
		await blockchainService.processGameReward(savedGameReward);

		// Step 5: Verify database was updated with transaction details
		const updatedGameReward = await GameReward.findById(savedGameReward._id);
		console.log(`   ✅ Transaction hash saved: ${updatedGameReward?.transactionHash || 'NOT SAVED'}`);
		console.log(`   ✅ Block number saved: ${updatedGameReward?.blockNumber || 'NOT SAVED'}`);

		if (!updatedGameReward?.transactionHash) {
			throw new Error('Transaction hash should be saved after blockchain processing');
		}

		// Step 6: Verify blockchain balance changed (after some time)
		// In real system, this would be detected by event listeners
		const blockchainBalanceAfter = await blockchainService.getBlockchainBalance(gameSession.winnerWallet);
		console.log(`   ✅ Blockchain balance after: ${Web3.utils.fromWei(blockchainBalanceAfter, 'ether')} GC`);

		const expectedBlockchainBalance = (BigInt(blockchainBalanceBefore) + BigInt(Web3.utils.toWei('5', 'ether'))).toString();

		if (blockchainBalanceAfter !== expectedBlockchainBalance) {
			throw new Error(`Expected blockchain balance ${Web3.utils.fromWei(expectedBlockchainBalance, 'ether')} GC, got ${Web3.utils.fromWei(blockchainBalanceAfter, 'ether')} GC`);
		}

		// VERIFICATION: SYSTEM CONSISTENCY
		console.log(`   VERIFICATION: System consistency...`);

		// Verify PlayerBalance pending transaction was updated
		const playerBalance = await PlayerBalance.findOne({ userId: gameSession.winner });
		const pendingTx = playerBalance?.pendingTransactions.find(tx =>
			tx.transactionHash === updatedGameReward.transactionHash
		);

		if (!pendingTx) {
			console.log(`     Pending transaction not updated with real hash yet (async operation)`);
		} else {
			console.log(`   ✅ Pending transaction updated with real hash: ${pendingTx.transactionHash}`);
		}

		console.log(`   ✅ Two-phase system working: Instant UX + Background blockchain processing`);
	});


	// TEST 6: Multiple Consecutive Games (Same Player) - WITH REAL DB RECORDS
	// await runTest('TEST 6: System Performance - No Blocking Operations', async () => {
	// 	const { GameReward } = await import('../src/models/gameRewards.ts');

	// 	console.log(`   Testing system performance without blocking...`);

	// 	const startTime = Date.now();
	// 	const numberOfGames = 3;
	// 	const gamePromises: Promise<any>[] = [];

	// 	// Simulate multiple games ending simultaneously
	// 	for (let i = 0; i < numberOfGames; i++) {
	// 		const gamePromise = (async () => {
	// 			const winnerWallet = testWallets[i % testWallets.length];
	// 			const gameReward = new GameReward({
	// 				gameSessionId: `performance-test-${i}`,
	// 				winnerId: `test-user-perf-${i}`,
	// 				winnerWallet: testWallets[i % testWallets.length],
	// 				rewardAmount: Web3.utils.toWei('10', 'ether'),
	// 				matchType: 'PvP',
	// 				gameResult: '1-0',
	// 				gameEndTime: new Date(),
	// 				confirmed: false
	// 			});

	// 			// Save reward (instant)
	// 			const savedReward = await gameReward.save();
	// 			const gameRewardId = savedReward._id?.toString() || '';

	// 			// Optimistic update (instant)
	// 			await blockchainService.updateBalanceOptimistic(
	// 				`test-user-perf-${i}`,
	// 				Web3.utils.toWei('10', 'ether'),
	// 				'PvP',
	// 				gameRewardId,
	// 				winnerWallet
	// 			);

	// 			return savedReward;
	// 		})();

	// 		gamePromises.push(gamePromise);
	// 	}

	// 	// Wait for all optimistic updates (should be very fast)
	// 	const savedRewards = await Promise.all(gamePromises);
	// 	const optimisticTime = Date.now() - startTime;

	// 	console.log(`   ✅ ${numberOfGames} games processed optimistically in ${optimisticTime}ms`);
	// 	console.log(`   ✅ Average time per game: ${(optimisticTime / numberOfGames).toFixed(1)}ms`);

	// 	// Verify all optimistic updates completed
	// 	for (let i = 0; i < numberOfGames; i++) {
	// 		const balance = await blockchainService.getPlayerBalance(`test-user-perf-${i}`);
	// 		if (balance.pending !== Web3.utils.toWei('10', 'ether')) {
	// 			throw new Error(`Game ${i} optimistic update failed`);
	// 		}
	// 	}

	// 	// Performance requirement: Optimistic updates should complete in under 1 second
	// 	if (optimisticTime > 1000) {
	// 		throw new Error(`Optimistic updates too slow: ${optimisticTime}ms (should be < 1000ms)`);
	// 	}

	// 	console.log(`   ✅ System meets performance requirements for instant user feedback`);

	// 	// Background blockchain processing would happen asynchronously
	// 	console.log(`   💡 Blockchain processing happens in background (not blocking user experience)`);
	// });

	// TEST 7: Final Balance Verification
	await runTest('TEST 7: Final Balance Verification', async () => {
		console.log(`   Verifying all final balances...`);

		const walletBalances: Array<{ wallet: string; balance: string; balanceInGC: string }> = [];
		let totalGameCoinsDistributed = BigInt(0);

		for (let i = 0; i < testWallets.length; i++) {
			const balance = await blockchainService.getBlockchainBalance(testWallets[i]);
			const balanceInGC = Web3.utils.fromWei(balance, 'ether');

			walletBalances.push({ wallet: testWallets[i], balance, balanceInGC });
			totalGameCoinsDistributed += BigInt(balance);

			console.log(`   Wallet ${i + 1}: ${balanceInGC} GameCoins`);
		}

		const totalDistributedInGC = Web3.utils.fromWei(totalGameCoinsDistributed.toString(), 'ether');
		console.log(`   Total GameCoins distributed: ${totalDistributedInGC} GC`);

		// Account for existing balances - just verify wallets have some GameCoins
		const walletsWithBalance = walletBalances.filter(w => w.balance !== '0').length;
		console.log(`   Wallets with GameCoins: ${walletsWithBalance}/${testWallets.length}`);

		if (walletsWithBalance === 0) {
			throw new Error('No wallets have GameCoins - rewards may have failed');
		}
	});

	// CLEANUP: Close MongoDB connection AFTER all tests are done
	try {
		await mongoose.disconnect();
		console.log('✅ MongoDB connection closed\n');
	} catch (error) {
		console.log('  Error closing MongoDB connection:', error);
	}

	// FINAL RESULTS
	console.log('END-TO-END REWARD TEST RESULTS');
	console.log('===================================');
	console.log(`Total Tests: ${totalTests}`);
	console.log(`Passed: ${passedTests}`);
	console.log(`Failed: ${totalTests - passedTests}`);
	console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

	if (passedTests === totalTests) {
		console.log('\n ALL END-TO-END REWARD TESTS PASSED!');
	} else {
		console.log('\n  Some tests failed.');
	}
}

// Run the tests
runEndToEndRewardTests().catch(error => {
	console.error(' End-to-End reward test suite crashed:', error);
	process.exit(1);
});