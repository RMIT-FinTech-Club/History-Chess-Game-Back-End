import { MarketplaceItem } from '../models/MarketplaceItem';
import { MarketplaceListing } from '../models/MarketplaceListing';
import { AuctionBid } from '../models/AuctionBid';
import { TransactionHistory } from '../models/TransactionHistory';
import { getRabbitMQ, RabbitMQConnection } from '../configs/rabbitmq';
import { postgresPrisma } from '../configs/prismaClient';
import { BlockchainService } from './blockchain.service';
import Web3 from 'web3';
import { PrismaClient } from '@prisma/client';

export class MarketService {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly blockchainService: BlockchainService,
        private readonly rabbitMQ: RabbitMQConnection
    ) {}

    async getItems(query: any) {
        // filter by category, dynasty, search
        let filter: any = { isActive: true };
        if (query.category && query.category !== 'all') filter.category = query.category;
        if (query.dynasty && query.dynasty !== 'all') filter.dynasty = query.dynasty;
        if (query.search) filter.name = { $regex: query.search, $options: 'i' };

        const items = await MarketplaceItem.find(filter).sort({ createdAt: -1 });
        return items;
    }

    async createItem(data: any) {
        return await MarketplaceItem.create(data);
    }

    async mintNFT(data: { tokenId: string, ownerId?: string, detailedInfo: any }) {
        return await this.prisma.nfts.create({
            data: {
                tokenId: data.tokenId,
                ownerId: data.ownerId || null,
                detailedInfo: data.detailedInfo
            }
        });
    }

    async buyItem(userId: string, data: { itemId: string, quantity: number }) {
        const item = await MarketplaceItem.findById(data.itemId);
        if (!item) throw new Error('Item not found');
        if (item.quantity < data.quantity) throw new Error('Not enough quantity available');

        const totalCost = item.price * data.quantity;
        const totalCostWei = Web3.utils.toWei(totalCost.toString(), 'ether');

        // Check user balance
        const balance = await this.blockchainService.getPlayerBalance(userId);
        const totalAvailable = BigInt(balance.confirmed) + BigInt(balance.pending);
        
        if (totalAvailable < BigInt(totalCostWei)) {
            throw new Error('Insufficient balance');
        }

        // Create pending transaction
        const tx = await TransactionHistory.create({
            userId,
            type: 'ITEM_PURCHASE',
            amount: -totalCost,
            currency: 'coins',
            description: `Bought ${data.quantity}x ${item.name}`,
            status: 'pending',
            metadata: {
                itemId: data.itemId,
                quantity: data.quantity,
                totalCostWei
            }
        });

     		// 4b. Fetch user wallet address for optimistic update
		const user = await this.prisma.users.findUnique({
			where: { id: userId },
			select: { walletAddress: true }
		});

		if (!user?.walletAddress) {
			throw new Error('User has no wallet address associated');
		}

		// 5. Update Balance Optimistically (immediate UI feedback)
		await this.blockchainService.updateBalanceOptimistic(
			userId,
			`-${totalCostWei}`, // Negative because we are spending
			'PvP', // Dummy type for marketplace spend
			tx._id as any,
			user.walletAddress
		);

        // Publish to rabbitmq for blockchain transaction/finalization
        if (this.rabbitMQ.isConnected()) {
             const channel = this.rabbitMQ.getChannel();
             const queues = this.rabbitMQ.getQueues();
             channel.sendToQueue(queues.rewardQueue, Buffer.from(JSON.stringify({
                 transactionType: 'buyItem',
                 userId,
                 itemId: data.itemId,
                 quantity: data.quantity,
                 totalCost: totalCostWei,
                 transactionId: tx._id
             })));
        }

        return { message: 'Purchase processing', transactionId: tx._id };
    }

    async getAuctions() {
        return await MarketplaceListing.find({ status: 'OPEN' }).sort({ startTime: -1 });
    }

    async createAuction(userId: string, data: any) {
        return await MarketplaceListing.create({ ...data, sellerId: userId, status: 'OPEN' });
    }

    async placeBid(userId: string, data: { listingId: string, amount: number }) {
        const listing = await MarketplaceListing.findById(data.listingId);
        if (!listing) throw new Error('Auction not found');
        if (listing.status !== 'OPEN') throw new Error('Auction is not open');

        if (data.amount <= (listing.currentBid || listing.price)) {
            throw new Error('Bid must be higher than current bid/price');
        }

        // Save bid
        const bid = await AuctionBid.create({
            listingId: listing._id,
            bidderId: userId,
            amount: data.amount
        });

        listing.currentBid = data.amount;
        listing.highestBidderId = userId;
        await listing.save();

        return bid;
    }

    async getBids(listingId: string) {
        return await AuctionBid.find({ listingId }).sort({ amount: -1 });
    }

    async endAuction(userId: string, listingId: string) {
        const listing = await MarketplaceListing.findById(listingId);
        if (!listing) throw new Error('Auction not found');
        if (listing.sellerId !== userId) throw new Error('Not the seller');
        if (listing.status !== 'OPEN') throw new Error('Auction already ended or cancelled');

        listing.status = 'ENDED';
        listing.endTime = new Date();
        await listing.save();

        if (listing.highestBidderId) {
            // Trigger RabbitMQ event for NFT transfer and coin transfer
            const tx = await TransactionHistory.create({
                userId: listing.highestBidderId,
                type: 'AUCTION_WIN',
                amount: -(listing.currentBid || 0),
                currency: 'coins',
                description: `Won auction for NFT ${listing.nftId}`,
                status: 'pending',
                metadata: {
                    listingId: listing._id,
                    nftId: listing.nftId
                }
            });

            if (this.rabbitMQ.isConnected()) {
                const channel = this.rabbitMQ.getChannel();
                channel.sendToQueue(this.rabbitMQ.getQueues().rewardQueue, Buffer.from(JSON.stringify({
                    transactionType: 'auctionWin',
                    winnerId: listing.highestBidderId,
                    sellerId: listing.sellerId,
                    nftId: listing.nftId,
                    amount: listing.currentBid,
                    transactionId: tx._id
                })));
            }
        }

        return { message: 'Auction ended' };
    }

    async getUserItems(userId: string) {
        // Fetch all NFTs owned by this user from PostgreSQL
        const nfts = await this.prisma.nfts.findMany({
            where: { ownerId: userId }
        });

        // Map to common format for frontend
        const mappedItems = nfts.map(nft => {
            const info = nft.detailedInfo as any || {};
            return {
                id: nft.id,
                tokenId: nft.tokenId,
                name: info.name || `NFT #${nft.tokenId}`,
                description: info.description || '',
                imageUrl: info.imageUrl || '',
                rarity: info.rarity || 'COMMON',
                dynasty: info.dynasty || '',
                category: info.category?.toUpperCase() === 'SKIN' ? 'SKIN' : 'ITEM',
                mintedTime: nft.mintedTime.toISOString()
            };
        });

        return {
            skins: mappedItems.filter(item => item.category === 'SKIN'),
            items: mappedItems.filter(item => item.category === 'ITEM')
        };
    }
}
