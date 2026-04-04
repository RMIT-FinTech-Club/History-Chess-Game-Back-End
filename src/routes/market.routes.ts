import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MarketController } from '../controllers/market.controller.ts';
import { authenticate, requireAdmin } from '../middleware/auth.ts';
import { CompositionRoot } from '../configs/compositionRoot.ts';

export default async function marketRoutes(fastify: FastifyInstance) {
	const compositionRoot = CompositionRoot.getInstance();
	const marketController = compositionRoot.marketController;

	fastify.get('/market/items', async (req, reply) => marketController.getItems(req, reply));
	fastify.post('/market/items', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => marketController.createItem(req, reply));
	fastify.post('/admin/nfts/mint', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => marketController.mintNFT(req, reply));
	fastify.post('/market/buy', { preHandler: [authenticate] }, async (req, reply) => marketController.buyItem(req, reply));
	
	fastify.get('/market/auctions', async (req, reply) => marketController.getAuctions(req, reply));
	fastify.post('/market/auction', { preHandler: [authenticate] }, async (req, reply) => marketController.createAuction(req, reply));
	// Alias for placeBid to match frontend
	fastify.post('/market/bid', { preHandler: [authenticate] }, async (req, reply) => marketController.placeBid(req, reply));
	
	fastify.post('/market/auction/bid', { preHandler: [authenticate] }, async (req, reply) => marketController.placeBid(req, reply));
	fastify.get('/market/auction/:listingId/bids', async (req, reply) => marketController.getBids(req, reply));
	
	// Support both param and body for listingId to match frontend
	fastify.post('/market/auction/:listingId/end', { preHandler: [authenticate] }, async (req, reply) => marketController.endAuction(req, reply));
	fastify.post('/market/auction/end', { preHandler: [authenticate] }, async (req, reply) => marketController.endAuction(req, reply));

	// User items endpoint
	fastify.get('/items/user/:userId', { preHandler: [authenticate] }, async (req, reply) => marketController.getUserItems(req, reply));
}
