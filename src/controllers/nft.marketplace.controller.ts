import { FastifyRequest, FastifyReply } from "fastify";
import { createListingService } from "../services/nft.marketplace.service";
import { purchaseListingService } from "../services/nft.marketplace.service";
import { cancelListingService } from "../services/nft.marketplace.service";

export type CreateListingInput = {
  tokenId: string;
  price: string;
  sellerAddress: string;
};

export type PurchaseListingInput = {
  nftListingId: string;
  buyerAddress: string;
};

export type CancelListingInput = {
  nftListingId: string;
  ownerAddress: string;
};

export const createListingController = async (
  request: FastifyRequest<{ Body: CreateListingInput }>,
  reply: FastifyReply
) => {
  try {
    const data = await createListingService(request.body);
    reply.code(201).send(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    request.log.error(`Error creating nft listing: ${message}`);
    reply.status(500).send({ message: "Internal server error" });
  }
};

export const purchaseListingController = async (
  request: FastifyRequest<{ Body: PurchaseListingInput }>,
  reply: FastifyReply
) => {
  try {
    const data = await purchaseListingService(request.body);
    reply.code(201).send(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    request.log.error(`Error creating nft listing: ${message}`);
    reply.status(500).send({ message: "Internal server error" });
  }
};

export const cancelListingController = async (
  request: FastifyRequest<{ Body: CancelListingInput }>,
  reply: FastifyReply
) => {
  try {
    const data = await cancelListingService(request.body);
    reply.code(201).send(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    request.log.error(`Error creating nft listing: ${message}`);
    reply.status(500).send({ message: "Internal server error" });
  }
};
