import { FastifyRequest, FastifyReply } from 'fastify';
import { MarketService } from '../services/market.service';

export class MarketController {
	constructor(private readonly marketService: MarketService) {}

	async getItems(request: FastifyRequest, reply: FastifyReply) {
		try {
			const query = request.query as any;
			const items = await this.marketService.getItems(query);
			return reply.status(200).send({ success: true, data: items });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async createItem(request: FastifyRequest | any, reply: FastifyReply) {
		try {
			const item = await this.marketService.createItem(request.body);
			return reply.status(201).send({ success: true, data: item });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async mintNFT(request: FastifyRequest | any, reply: FastifyReply) {
		try {
			const nft = await this.marketService.mintNFT(request.body);
			return reply.status(201).send({ success: true, data: nft });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async buyItem(request: FastifyRequest | any, reply: FastifyReply) {
		try {
			const userId = request.authUser.id;
			const result = await this.marketService.buyItem(userId, request.body);
			return reply.status(200).send({ success: true, data: result });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async getAuctions(request: FastifyRequest, reply: FastifyReply) {
		try {
			const auctions = await this.marketService.getAuctions();
			return reply.status(200).send({ success: true, data: auctions });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async createAuction(request: FastifyRequest | any, reply: FastifyReply) {
		try {
			const userId = request.authUser.id;
			const auction = await this.marketService.createAuction(userId, request.body);
			return reply.status(201).send({ success: true, data: auction });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async placeBid(request: FastifyRequest | any, reply: FastifyReply) {
		try {
			const userId = request.authUser.id;
			const bid = await this.marketService.placeBid(userId, request.body);
			return reply.status(201).send({ success: true, data: bid });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async getBids(request: FastifyRequest | any, reply: FastifyReply) {
		try {
			const { listingId } = request.params;
			const bids = await this.marketService.getBids(listingId);
			return reply.status(200).send({ success: true, data: bids });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async endAuction(request: FastifyRequest | any, reply: FastifyReply) {
		try {
			const userId = request.authUser.id;
			const { listingId: paramId } = request.params;
			const { listingId: bodyId } = request.body || {};
			const listingId = paramId || bodyId;
			
			if (!listingId) {
				return reply.status(400).send({ success: false, error: "Listing ID is required" });
			}

			const result = await this.marketService.endAuction(userId, listingId);
			return reply.status(200).send({ success: true, data: result });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}

	async getUserItems(request: FastifyRequest | any, reply: FastifyReply) {
		try {
			const { userId } = request.params;
			const items = await this.marketService.getUserItems(userId);
			return reply.status(200).send({ success: true, data: items });
		} catch (error: any) {
			return reply.status(500).send({ success: false, error: error.message });
		}
	}
}
