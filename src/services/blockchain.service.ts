import Web3 from 'web3';
import type { AbiItem } from 'web3-utils';
import { PlayerBalance } from '../models/playerBalance.ts';
import { GameReward } from '../models/gameRewards.ts';
import mongoose from 'mongoose';

interface IBlockchainEventLog {
	contractAddress: string;
	eventName: string;
	blockNumber: number;
	transactionHash: string;
	logIndex: number;
	playerAddress: string;
	rewardAmount: string;
	matchType: string;
	processed: boolean;
	processedAt?: Date;
	error?: string;
	retryCount: number;
	createdAt: Date;
}

interface IFailedBlockchainTransaction {
	userId: string;
	walletAddress: string;
	transactionType: string;
	amount: string;
	error: string;
	gameSessionId?: string;
	retryCount: number;
	status: string;
	firstAttemptAt: Date;
}

// GameCoin contract ABI functions
const GAME_COIN_ABI: AbiItem[] = [
	{
		"inputs": [{ "name": "player", "type": "address" }],
		"name": "rewardPvPWin",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{ "name": "player", "type": "address" }],
		"name": "rewardBotWin",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{ "name": "account", "type": "address" }],
		"name": "balanceOf",
		"outputs": [{ "name": "", "type": "uint256" }],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "name": "player", "type": "address" },
			{ "indexed": false, "name": "reward", "type": "uint256" },
			{ "indexed": false, "name": "matchType", "type": "string" }
		],
		"name": "MatchWin",
		"type": "event"
	}
];

export class BlockchainService {
	private web3: Web3;
	private contract: any;
	private account: string;

	constructor() {
		// Initialize Web3 with RPC url from environment
		this.web3 = new Web3(process.env.RPC_URL || 'http://127.0.0.1:8545');

		// Create contract instance 
		this.contract = new this.web3.eth.Contract(
			GAME_COIN_ABI,
			process.env.GAME_COIN_CONTRACT_ADDRESS
		);

		// Set up the account that will send transactions
		this.account = process.env.DEPLOYER_PRIVATE_KEY!;
		this.web3.eth.accounts.wallet.add(this.account);
	}

	/**
	 * THE REWARD PROCESSOR
	 * 1. Validates game reward
	 * 2. Sends blockchain transaction
	 * 3. Updates mongodb cache
	 * 4. Handles errors 
	 */
	async processGameReward(gameReward: any): Promise<void> {
		console.log(`Processing blockchain reward for winner ${gameReward.winnerId}`);

		try {
			// Determine which method to call based on the match type:
			const methodName = gameReward.matchType === 'PvP' ? 'rewardPvPWin' : 'rewardBotWin';
			console.log(`Calling ${methodName} for ${gameReward.winnerWallet}`);

			// Get the account address from private key for sending points/coins
			const fromAddress = this.web3.eth.accounts.privateKeyToAccount(this.account).address;

			const gasPrice = await this.web3.eth.getGasPrice();
			const gasEstimate = await this.contract.methods[methodName](gameReward.winnerWallet)
				.estimateGas({ from: fromAddress });
			const gasLimit = Math.floor(Number(gasEstimate) * 1.2);

			// Send the transaction to the winner:
			const transaction = await this.contract.methods[methodName](gameReward.winnerWallet)
				.send({
					from: fromAddress,
					gas: gasLimit,
					gasPrice: gasPrice
				});

			console.log(`Reward transaction sent: ${transaction.transactionHash}`);

			try {
				// Update the GameReward record with transaction details
				await GameReward.findByIdAndUpdate(gameReward._id, {
					transactionHash: transaction.transactionHash,
					blockNumber: Number(transaction.blockNumber),
					rewardSentAt: new Date()
				});

				// Update the pending transaction in PlayerBalance with real transaction details
				await this.updatePendingTransaction(
					gameReward.winnerId,
					`pending-${gameReward._id}`,
					transaction.transactionHash
				);

				console.log(`Reward processing completed for ${gameReward.winnerId}`);
			} catch (mongoError) {
				console.error('Failed to update MongoDB after blockchain transaction:', mongoError);

				// Log the failed transaction for manual review
				await this.logFailedTransaction(gameReward, 'MongoDB update failed after blockchain transaction');

				throw new Error('Blockchain transaction succeeded, but MongoDB update failed. Manual intervention required.');
			}

		} catch (error) {
			console.error('Error processing blockchain reward: ', error);

			// TypeScript aint know the type of the caught error, so we need to handle it 
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.logFailedTransaction(gameReward, errorMessage);
			throw error;
		}
	}

	private async updatePendingTransaction(
		userId: string,
		tempTxHash: string,
		realTxHash: string
	): Promise<void> {
		await PlayerBalance.updateOne(
			{
				userId,
				'pendingTransactions.transactionHash': tempTxHash
			},
			{
				$set: {
					'pendingTransactions.$.transactionHash': realTxHash,
					'pendingTransactions.$.status': 'pending'
				}
			}
		);
	}

	private async logFailedTransaction(gameReward: any, errorMessage: string): Promise<void> {
		try {
			// Check if database connection exists
			if (!mongoose.connection.db) {
				console.error('MongoDB connection NOT available');
				return;
			}

			const db = mongoose.connection.db;
			await db.collection('failedblockchaintransactions').insertOne({
				userId: gameReward.winnerId,
				walletAddress: gameReward.winnerWallet,
				transactionType: 'reward',
				amount: gameReward.rewardAmount,
				error: errorMessage,
				gameSessionId: gameReward.gameSessionId,
				retryCount: 0,
				status: 'pending',
				firstAttemptAt: new Date(),
				lastAttemptAt: new Date()
			});

			console.log('Failed transaction logged successfully');
		} catch (logError) {
			const logErrorMessage = logError instanceof Error ? logError.message : 'Unknown logging error';
			console.error('Failed to log failed transaction: ', logErrorMessage);
		}


	}

	/**
	 * BALANCE UPDATE
	 * Updates player's cached balance as the match ends
	 * Trigger the UI of the game
	 */
	// async updateBalanceOptimistic(
	// 	userId: string,
	// 	amount: string,
	// 	matchType: 'PvP' | 'Bot',
	// 	gameRewardId: string
	// ): Promise<void> {
	// 	console.log(`Balance update: +${Web3.utils.fromWei(amount, 'ether')} GameCoins for ${userId}`);

	// 	// Create or update player balance
	// 	await PlayerBalance.findOneAndUpdate(
	// 		{ userId },
	// 		{
	// 			// The database operation:
	// 			$inc: {
	// 				pendingBalance: amount, // add game coins to pending
	// 				version: 1 // increment version
	// 			},
	// 			$push: {
	// 				pendingTransactions: {
	// 					transactionHash: `pending-${gameRewardId}`, // temporary ash until real one available
	// 					amount,
	// 					type: matchType,
	// 					status: 'pending',
	// 					createdAt: new Date()
	// 				}
	// 			},
	// 			$set: { lastUpdated: new Date() }
	// 		},
	// 		{
	// 			upsert: true, 
	// 			new: true // return the updated document
	// 		}
	// 	);

	// 	console.log('Caching is done');
	// }

	async updateBalanceOptimistic(
		userId: string,
		amount: string,
		matchType: 'PvP' | 'Bot',
		gameRewardId: string,
		walletAddress: string | null
	): Promise<void> {
		console.log(`Balance update: +${Web3.utils.fromWei(amount, 'ether')} GameCoins for ${userId}`);

		// Validate wallet address
		if (!walletAddress) {
			throw new Error(`Cannot process reward: User ${userId} has no wallet address`);
		}

		try {
			// Find existing balance first (to handle string math)
			const existingBalance = await PlayerBalance.findOne({ userId });

			let newPendingBalance: string;
			if (existingBalance) {
				// Accumulate: Add new amount to existing pending balance
				const currentPending = existingBalance.pendingBalance || '0';
				newPendingBalance = (BigInt(currentPending) + BigInt(amount)).toString();
			} else {
				// New user: pending balance = amount
				newPendingBalance = amount;
			}

			// Update or create player balance record
			await PlayerBalance.findOneAndUpdate(
				{ userId },
				{
					// Set operations (not $inc, because we're dealing with strings)
					$set: {
						pendingBalance: newPendingBalance, // Set calculated total pending
						lastUpdated: new Date(),
						walletAddress: walletAddress.toLowerCase() // CRITICAL: Set wallet for new records
					},
					$inc: {
						version: 1 // Only increment the numeric version field
					},
					$push: {
						pendingTransactions: {
							transactionHash: `pending-${gameRewardId}`,
							amount,
							type: matchType,
							status: 'pending',
							createdAt: new Date()
						}
					}
				},
				{
					upsert: true, // Create if doesn't exist
					new: true
				}
			);

			console.log(`Successfully updated balance for ${userId}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`Error updating balance for ${userId}: ${errorMessage}`);
			throw error;
		}
	}

	/**
	 * BLOCKCHAIN EVENT PROCESSOR
	 * Process MatchWin events from blockchain to confirm rewards
	 * This runs when blockchain transactions are mined and confirmed
	 * Moves balance from 'pending' to 'confirmed'
	 */
	async processMatchWinEvent(event: any): Promise<void> {
		const { player, reward, matchType } = event.returnValues;
		const { transactionHash, blockNumber } = event;

		console.log(`Processing MatchWin event: ${player} won ${Web3.utils.fromWei(reward, 'ether')} GameCoins`);

		try {
			const existingEvent = await this.checkEventProcessed(transactionHash);

			if (existingEvent) {
				console.log(`Event ${transactionHash} already processed, skipping`);
				return;
			}

			await this.logBlockchainEvent({
				contractAddress: event.address.toLowerCase(),
				eventName: 'MatchWin',
				blockNumber: parseInt(blockNumber),
				transactionHash,
				logIndex: event.logIndex,
				playerAddress: player.toLowerCase(),
				rewardAmount: reward.toString(),
				matchType,
				processed: false,
				retryCount: 0,
				createdAt: new Date()
			});

			try {
				await this.confirmPlayerReward(
					player.toLowerCase(),
					reward.toString(),
					transactionHash,
					blockNumber
				);

				await GameReward.updateOne(
					{ transactionHash },
					{
						confirmed: true,
						blockNumber: parseInt(blockNumber),
						confirmedAt: new Date()
					}
				);

				await this.markEventProcessed(transactionHash);
			} catch (mongoError) {
				console.error('Failed to update MongoDB during MatchWin event processing:', mongoError);

				// Log the failure for manual review
				await this.logBlockchainEvent({
					contractAddress: event.address.toLowerCase(),
					eventName: 'MatchWin',
					blockNumber: parseInt(blockNumber),
					transactionHash,
					logIndex: event.logIndex,
					playerAddress: player.toLowerCase(),
					rewardAmount: reward.toString(),
					matchType,
					processed: false,
					error: mongoError.message,
					retryCount: 0,
					createdAt: new Date()
				});

				throw new Error('MatchWin event processing failed. Manual intervention required.');
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error('Error processing MatchWin event:', errorMessage);
			throw error;
		}
	}

	private async checkEventProcessed(transactionHash: string): Promise<boolean> {
		const db = mongoose.connection.db;
		const existing = await db?.collection('blockchaineventlogs').findOne({ transactionHash });
		return !!existing;
	}

	private async logBlockchainEvent(eventData: IBlockchainEventLog): Promise<void> {
		const db = mongoose.connection.db;
		await db?.collection('blockchaineventlogs').insertOne(eventData);
	}

	private async confirmPlayerReward(
		walletAddress: string,
		rewardAmount: string,
		transactionHash: string,
		blockNumber: number
	): Promise<void> {
		const playerBalance = await PlayerBalance.findOne({
			walletAddress: walletAddress.toLowerCase()
		});

		if (playerBalance) {
			// find the pending transaction that matches this confirmation
			const pendingTxIndex = playerBalance.pendingTransactions.findIndex(
				tx => tx.transactionHash === transactionHash
			);

			if (pendingTxIndex >= 0) {
				// Move from pending to confirmed balance
				await PlayerBalance.updateOne(
					{ walletAddress: walletAddress.toLowerCase() },
					{
						$inc: {
							balance: rewardAmount, // add to confirmed balance
							pendingBalance: `-${rewardAmount}` // remove from pending balance
						},
						$set: {
							[`pendingTransaction.${pendingTxIndex}.status`]: 'confirmed',
							[`pendingTransactions.${pendingTxIndex}.blockNumber`]: blockNumber,
							lastSyncedBlock: Math.max(playerBalance.lastSyncedBlock, blockNumber), // remember the highest block number we've processed successfully
							lastUpdated: new Date(),
							needsSync: false
						}
					}
				);
				console.log(`Confirmed optimistic update for ${walletAddress}`);
			} else {
				// No pending transaction found
				await PlayerBalance.findOneAndUpdate(
					{ walletAddress: walletAddress.toLowerCase() },
					{
						$inc: { balance: rewardAmount },
						$set: {
							lastSyncedBlock: Math.max(playerBalance.lastSyncedBlock, blockNumber),
							lastUpdated: new Date(),
							needsSync: false
						}
					},
					{ upsert: true }
				);

			}
		}
	}

	private async markEventProcessed(transactionHash: string): Promise<void> {
		const db = mongoose.connection.db;
		await db?.collection('blockchaineventlogs').updateOne(
			{ transactionHash },
			{
				$set: {
					processed: true,
					processedAt: new Date()
				}
			}
		)
	}

	/**
	 * TOTAL BALANCE
	 * Gets the total balance = confirmed + pending
	 */
	async getPlayerBalance(userId: string): Promise<{
		total: string;
		confirmed: string;
		pending: string;
		pendingCount: number;
	}> {
		const playerBalance = await PlayerBalance.findOne({ userId });

		if (!playerBalance) {
			return {
				total: '0',
				confirmed: '0',
				pending: '0',
				pendingCount: 0
			}
		}

		const confirmed = playerBalance.balance || '0';
		const pending = playerBalance.pendingBalance || '0';
		const total = (BigInt(confirmed) + BigInt(pending)).toString();
		const pendingCount = playerBalance.pendingTransactions.filter(tx => tx.status === 'pending').length;

		return {
			total,
			confirmed,
			pending,
			pendingCount
		};
	}

	/**
	 * VERIFY BLOCKCHAIN BALANCE
	 */
	async getBlockchainBalance(walletAddress: string): Promise<string> {
		try {
			const balance = await this.contract.methods.balanceOf(walletAddress).call();
			return balance.toString();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`Error fetching blockchain balance for ${walletAddress}: `, errorMessage);
			throw error;
		}
	}

	/**
	 * AUTOMATIC BALANCE UPDATES WHEN TRANSACTIONS MINTED
	 */
	startEventListener(): void {
		console.log('Blockcchain even listener is working');

		this.contract.events.MatchWin({
			fromBlock: 'latest'
		})
			.on('data', async (event: any) => {
				console.log('New MatchWin event...');
				await this.processMatchWinEvent(event);
			})
			.on('error', (error: any) => {
				console.error('Event listener error');
			});

	}

	async createWallet(): Promise<string> {
		try {
			const account = this.web3.eth.accounts.create();
			console.log(`New wallet created: ${account.address}`);
			return account.address;
		} catch (error) {
			console.error('Error creating wallet:', error);
			throw new Error('Failed to create wallet');
		}
	}
}