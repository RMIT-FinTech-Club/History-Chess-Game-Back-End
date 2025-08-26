import { FastifyPluginAsync } from 'fastify';
import { marketplaceController } from '../controllers/marketplace.controller';

const marketplaceRoutes: FastifyPluginAsync = async (server) => {

    // GET route for a single listing, using the controller
    server.get('/listing/:nftAddress/:tokenId', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    nftAddress: { type: 'string' },
                    tokenId: { type: 'string' },
                },
                required: ['nftAddress', 'tokenId'],
            },
        },
    }, marketplaceController.getListingHandler);

    // POST route to list an NFT, using the controller
    server.post('/listNft', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    price: { type: 'string' }, // Now only the price is needed
                },
                required: ['price'], // The only required property is now 'price'
            },
        },
    }, marketplaceController.listNftHandler);
    
    // You would add more routes here, all using the controller pattern
};

export default marketplaceRoutes;