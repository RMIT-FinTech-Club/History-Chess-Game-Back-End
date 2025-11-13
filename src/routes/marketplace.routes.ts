import { FastifyPluginAsync } from "fastify";
import { authenticate } from "../middleware/auth";
import * as MarketplaceService from "../services/marketplace.service";

const marketplaceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/upload", { preHandler: authenticate }, async (request, reply) => {
    const data = request.body;
    const result = await MarketplaceService.uploadNFTItem(request.authUser.id, data);
    return result;
  });
};

export default marketplaceRoutes;