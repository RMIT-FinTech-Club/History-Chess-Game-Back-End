import { FastifyPluginAsync } from "fastify";
import { createListingController } from "../controllers/nft.marketplace.controller";
import { purchaseListingController } from "../controllers/nft.marketplace.controller";
import { cancelListingController } from "../controllers/nft.marketplace.controller";

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/create", createListingController);
  fastify.post("/purchase", purchaseListingController);
  fastify.post("/cancel", cancelListingController);
};

export default routes;
