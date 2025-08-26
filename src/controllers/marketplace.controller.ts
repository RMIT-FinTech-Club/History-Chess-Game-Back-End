import { FastifyReply, FastifyRequest } from 'fastify';
import { marketplaceService } from '../services/marketplace.service';

/**
 * Controller for marketplace-related API endpoints.
 */
export const marketplaceController = {
    
    /**
     * Handles the request to get a specific NFT listing.
     * @param request The Fastify request object.
     * @param reply The Fastify reply object.
     */
    getListingHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        const { nftAddress, tokenId } = request.params as { nftAddress: string, tokenId: string };
        
        // Pass the contracts directly from the server object
        const contracts = {
            nftMarketplaceContract: request.server.nftMarketplaceContract,
            basicNftContract: request.server.basicNftContract,
        };

        try {
            const listing = await marketplaceService.getListing(contracts, nftAddress, parseInt(tokenId));
            
            if (!listing) {
                return reply.status(404).send({ error: 'Listing not found.' });
            }

            return reply.send({ success: true, data: listing });
        } catch (error) {
            request.server.log.error(error);
            return reply.status(500).send({ error: (error as Error).message });
        }
    },

    /**
     * Handles the request to get all NFT listings.
     * @param request The Fastify request object.
     * @param reply The Fastify reply object.
     */
    getAllListingsHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // Call the service function to get all listings
            const listings = await marketplaceService.getAllListings();
            return reply.send({ success: true, data: listings });
        } catch (error) {
            request.server.log.error(error);
            return reply.status(500).send({ error: (error as Error).message });
        }
    },
    
    /**
     * Handles the request to list an NFT for sale.
     * The response will now contain the nftAddress and tokenId.
     * @param request The Fastify request object.
     * @param reply The Fastify reply object.
     */
    listNftHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        const { price } = request.body as { price: string };
        
        const contracts = {
            nftMarketplaceContract: request.server.nftMarketplaceContract,
            basicNftContract: request.server.basicNftContract,
        };

        try {
            // Call the service function, which now returns the full details
            const result = await marketplaceService.mintAndListNft(contracts, price);
            return reply.send({ success: true, data: result });
        } catch (error) {
            request.server.log.error(error);
            return reply.status(500).send({ error: (error as Error).message });
        }
    }
};