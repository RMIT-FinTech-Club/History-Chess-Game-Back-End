import { getRabbitMQ } from '../configs/rabbitmq.ts';
import { BlockchainService } from '../services/blockchain.service.ts';
import { GameReward } from '../models/gameRewards.ts';
import { PlayerBalance } from '../models/playerBalance.ts';
import { MarketplaceItem } from '../models/MarketplaceItem.ts';
import { TransactionHistory } from '../models/TransactionHistory.ts';
import { postgresPrisma } from '../configs/prismaClient.ts';
import { BlockchainMessage, RewardMessage, BuyItemMessage } from '../queues/publishers/reward.publisher.ts';
import Web3 from 'web3';
import type { ConsumeMessage } from 'amqplib';

export class BlockchainWorker {
	private blockchainService: BlockchainService;
	private isRunning = false;

	constructor() {
		this.blockchainService = new BlockchainService();
	}

	public async start(): Promise<void> {
		if (this.isRunning) {
			console.log('⚠️  Worker already running');
			return;
		}

		console.log('\n Starting Blockchain Worker...\n');
		try {
			const rabbitmq = getRabbitMQ();
			if (!rabbitmq.isConnected()) {
				throw new Error('RabbitMQ not connected');
			}

			const channel = rabbitmq.getChannel();
			const queues = rabbitmq.getQueues();

			this.isRunning = true;

			await channel.consume(
				queues.rewardQueue,
				async (msg: ConsumeMessage | null) => {
					if (!msg) return;
					await this.processMessage(msg, channel);
				},
				{ noAck: false }
			);

			console.log('✅ Worker is processing messages...\n');
		} catch (error) {
			console.error('⚠️ Failed to start worker:', error);
			this.isRunning = false;
			throw error;
		}
	}

	private async processMessage(msg: ConsumeMessage, channel: any): Promise<void> {
		const startTime = Date.now();
		try {
			const messageContent = msg.content.toString();
			const data: BlockchainMessage = JSON.parse(messageContent);

			console.log(`\n[${new Date().toISOString()}] Processing ${data.transactionType}...`);

			if (data.transactionType === 'reward') {
				await this.handleReward(data as RewardMessage);
			} else if (data.transactionType === 'buyItem') {
				await this.handleBuyItem(data as BuyItemMessage);
			} else {
				console.warn(`Unknown transaction type: ${data.transactionType}`);
			}

			channel.ack(msg);
			console.log(`✅ ${data.transactionType} processed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
		} catch (error) {
			console.error('⚠️ Message processing failed:', error);
			console.error('   Message Content:', msg.content.toString());
			channel.nack(msg, false, false); // Send to DLQ
		}
	}

	private async handleReward(message: RewardMessage): Promise<void> {
		const gameReward = await GameReward.findById(message.gameRewardId);
		if (!gameReward) throw new Error(`GameReward ${message.gameRewardId} not found`);
		if (gameReward.transactionHash) return; // Already processed

		await this.blockchainService.processGameReward(gameReward);

		const updatedGameReward = await GameReward.findById(message.gameRewardId);
		if (!updatedGameReward?.transactionHash) throw new Error('Transaction hash not saved');

		await this.updatePlayerBalance(
			message.userId,
			message.walletAddress,
			message.amount,
			updatedGameReward.transactionHash,
			message.matchType
		);

		await GameReward.findByIdAndUpdate(message.gameRewardId, {
			confirmed: true,
			confirmedAt: new Date()
		});
	}

	private async handleBuyItem(message: BuyItemMessage): Promise<void> {
		console.log(`Finalizing purchase for user ${message.userId}, item ${message.itemId}`);
		
		// 1. Double check item availability
		const item = await MarketplaceItem.findById(message.itemId);
		if (!item || item.quantity < message.quantity) {
			throw new Error('Item no longer available or insufficient quantity');
		}

		// 2. Reduce quantity in MongoDB
		await MarketplaceItem.findByIdAndUpdate(message.itemId, {
			$inc: { quantity: -message.quantity }
		});

		// 3. Create NFT record in PostgreSQL
		await postgresPrisma.nfts.create({
			data: {
				tokenId: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
				ownerId: message.userId,
				detailedInfo: {
					name: item.name,
					description: item.description,
					imageUrl: item.imageUrl,
					rarity: item.rarity,
					dynasty: item.dynasty,
					category: item.category,
					purchasePrice: message.totalCost
				}
			}
		});

		// 4. Confirm transaction in MongoDB
		await TransactionHistory.findByIdAndUpdate(message.transactionId, {
			status: 'confirmed',
			createdAt: new Date()
		});

		// 5. Update PlayerBalance (move pending to confirmed)
		const playerBalance = await PlayerBalance.findOne({ userId: message.userId });
		if (playerBalance) {
			const currentBalance = BigInt(playerBalance.balance || '0');
			const currentPending = BigInt(playerBalance.pendingBalance || '0');
			const cost = BigInt(message.totalCost);

			await PlayerBalance.updateOne(
				{ userId: message.userId },
				{
					$set: {
						balance: (currentBalance - cost).toString(),
						pendingBalance: (currentPending + cost).toString(), // Since cost was negative in optimistic update, we "add" it back to move towards zero
						lastUpdated: new Date()
					}
				}
			);
		}
		
		// NOTE: Above logic assumes updateBalanceOptimistic was called with a negative amount.
		// If balance was '100', and we bought for '20', pending became '-20', total remained '80'.
		// Now we want confirmed to be '80' and pending to be '0'.
	}

	private async updatePlayerBalance(
		userId: string,
		walletAddress: string,
		amount: string,
		transactionHash: string,
		matchType: 'PvP' | 'Bot'
	): Promise<void> {
		let playerBalance = await PlayerBalance.findOne({ userId });
		if (!playerBalance) {
			playerBalance = new PlayerBalance({
				userId,
				walletAddress: walletAddress.toLowerCase(),
				balance: amount,
				pendingBalance: '0',
				version: 1,
				lastUpdated: new Date(),
				pendingTransactions: [{
					transactionHash,
					amount,
					type: matchType,
					status: 'confirmed',
					createdAt: new Date()
				}]
			});
			await playerBalance.save();
			return;
		}

		const pendingTxIndex = playerBalance.pendingTransactions.findIndex(
			tx => tx.transactionHash === transactionHash || tx.transactionHash === `pending-${transactionHash}`
		);

		const currentBalance = BigInt(playerBalance.balance || '0');
		const currentPending = BigInt(playerBalance.pendingBalance || '0');
		const rewardAmount = BigInt(amount);

		if (pendingTxIndex !== -1) {
			await PlayerBalance.updateOne(
				{ userId },
				{
					$set: {
						balance: (currentBalance + rewardAmount).toString(),
						pendingBalance: (currentPending - rewardAmount).toString(),
						[`pendingTransactions.${pendingTxIndex}.status`]: 'confirmed',
						[`pendingTransactions.${pendingTxIndex}.transactionHash`]: transactionHash,
						lastUpdated: new Date()
					}
				}
			);
		} else {
			await PlayerBalance.updateOne(
				{ userId },
				{
					$set: {
						balance: (currentBalance + rewardAmount).toString(),
						lastUpdated: new Date()
					},
					$push: {
						pendingTransactions: {
							transactionHash,
							amount,
							type: matchType,
							status: 'confirmed',
							createdAt: new Date()
						}
					}
				}
			);
		}
	}

	public async stop(): Promise<void> {
		this.isRunning = false;
	}
}

let workerInstance: BlockchainWorker | null = null;
export function getBlockchainWorker(): BlockchainWorker {
	if (!workerInstance) workerInstance = new BlockchainWorker();
	return workerInstance;
}