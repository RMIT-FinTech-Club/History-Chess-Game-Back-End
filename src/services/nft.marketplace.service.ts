/* eslint-disable @typescript-eslint/no-explicit-any */
import { mongoPrisma } from "../configs/mongoPrismaClient";
import { PrismaClient } from "@prisma/client";
import { publish } from "../utils/rabbitmq";
import { CreateListingInput } from "controllers/nft.marketplace.controller";
import { PurchaseListingInput } from "controllers/nft.marketplace.controller";
import { CancelListingInput } from "controllers/nft.marketplace.controller";

const prisma = new PrismaClient();

export async function createListingService(input: CreateListingInput) {
  const { tokenId, price, sellerAddress } = input;
  if (!tokenId || !price || !sellerAddress)
    throw new Error("tokenId, price, sellerAddress required");

  // 1. Verify ownership off-chain using DB
  const seller = await prisma.users.findUnique({
    where: { walletAddress: sellerAddress },
    include: { ownedNFTs: true },
  });

  if (!seller) throw new Error("walletAddress does not match sellerAddress");

  const nft = seller.ownedNFTs.find((n) => n.tokenId === tokenId);
  if (!nft) throw new Error("Seller does not own this NFT");

  const nftId = nft.id;

  // 2. Check if NFT is already listed
  const existingListing = await mongoPrisma.nFTMarketplaceListing.findFirst({
    where: {
      tokenId: tokenId,
      status: {
        in: [
          "CREATE_PENDING",
          "CREATE_IN_NETWORK",
          "ON_SALE",
          "PURCHASE_PENDING",
          "PURCHASE_IN_NETWORK",
          "CANCEL_PENDING",
          "CANCEL_IN_NETWORK",
        ],
      },
    },
  });

  if (existingListing)
    throw new Error("This NFT is already listed in marketplace");

  // 3. Create DB record
  const NFTMarketplaceListing = await mongoPrisma.nFTMarketplaceListing.create({
    data: {
      nftListingId: "",
      nftContractAddress: process.env.NFTContract_Contract_Address!,
      tokenId: tokenId,
      price: price,
      status: "CREATE_PENDING",
      sellerAddress,
    },
  });

  // 4. Publish to RabbitMQ
  await publish("marketplace.create", {
    listingId: NFTMarketplaceListing.id,
    tokenId: tokenId,
    price: price,
    sellerAddress,
    nftContractAddress: process.env.NFTContract_Contract_Address,
  });

  return {
    listingId: NFTMarketplaceListing.id,
    nftId,
    sellerId: seller.id,
    status: "CREATE_PENDING",
  };
}

export async function purchaseListingService(input: PurchaseListingInput) {
  const { nftListingId, buyerAddress } = input;
  if (!nftListingId || !buyerAddress)
    throw new Error("nftListingId and buyerAddress required");

  // 1. Fetch the listing
  const listing = await mongoPrisma.nFTMarketplaceListing.findUnique({
    where: { nftListingId: nftListingId },
    select: {
      id: true,
      sellerAddress: true,
      tokenId: true,
      status: true,
      price: true,
    },
  });

  if (!listing) throw new Error("Listing not found");

  const { id, sellerAddress, tokenId, status } = listing;

  // 2. Check if buyer is same as seller
  if (sellerAddress === buyerAddress) {
    throw new Error("Buyer cannot be the same as seller");
  }

  // 3. Check if listing is available for purchase
  const invalidStatuses = [
    "CREATE_PENDING",
    "CREATE_IN_NETWORK",
    "CREATE_ERROR",
    "PURCHASE_PENDING",
    "PURCHASE_IN_NETWORK",
    "PURCHASED",
    "PURCHASE_ERROR",
    "CANCEL_PENDING",
    "CANCEL_IN_NETWORK",
    "CANCELLED",
    "CANCEL_ERROR",
  ];
  if (invalidStatuses.includes(status)) {
    throw new Error(`Listing not available for purchase (status: ${status})`);
  }

  const [seller, buyer, nft] = await Promise.all([
    prisma.users.findUnique({ where: { walletAddress: sellerAddress } }),
    prisma.users.findUnique({ where: { walletAddress: buyerAddress } }),
    prisma.nfts.findUnique({ where: { tokenId: tokenId } }),
  ]);

  if (!seller) throw new Error("Seller not found in users table");
  if (!buyer) throw new Error("Buyer not found in users table");
  if (!nft) throw new Error("NFT not found in nfts table");

  // 4. Update status in DB
  const updatedListing = await mongoPrisma.nFTMarketplaceListing.update({
    where: { id: id },
    data: {
      buyerAddress,
      status: "PURCHASE_PENDING",
    },
  });

  // 5. Publish to RabbitMQ
  await publish("marketplace.purchase", {
    listingId: updatedListing.id,
    nftListingId: updatedListing.nftListingId,
    price: updatedListing.price,
    buyerAddress,
  });

  return {
    listingId: updatedListing.id,
    nftId: nft.id,
    sellerId: seller.id,
    buyerId: buyer.id,
    status: "PURCHASE_PENDING",
  };
}

export async function cancelListingService(input: CancelListingInput) {
  const { nftListingId, ownerAddress } = input;
  if (!nftListingId || !ownerAddress)
    throw new Error("nftListingId and ownerAddress required");

  // 1. Check if listing existed
  const listing = await mongoPrisma.nFTMarketplaceListing.findUnique({
    where: { nftListingId: nftListingId },
    select: {
      id: true,
      tokenId: true,
      sellerAddress: true,
      status: true,
    },
  });

  if (!listing) throw new Error("Listing not found");

  const { id, tokenId, sellerAddress, status } = listing;

  // 2. Check to make sure only seller can cancel their own listing
  if (sellerAddress !== ownerAddress) {
    throw new Error("Only seller can cancel listing");
  }

  // 3. Check if listing is cancellable
  const invalidStatuses = [
    "CREATE_PENDING",
    "CREATE_IN_NETWORK",
    "CREATE_ERROR",
    "PURCHASE_PENDING",
    "PURCHASE_IN_NETWORK",
    "PURCHASED",
    "PURCHASE_ERROR",
    "CANCEL_PENDING",
    "CANCEL_IN_NETWORK",
    "CANCELLED",
    "CANCEL_ERROR",
  ];

  if (invalidStatuses.includes(status)) {
    throw new Error(`Listing not available for cancel (status: ${status})`);
  }

  const [seller, nft] = await Promise.all([
    prisma.users.findUnique({ where: { walletAddress: sellerAddress } }),
    prisma.nfts.findUnique({ where: { tokenId: tokenId } }),
  ]);

  if (!seller) throw new Error("Seller not found in users table");
  if (!nft) throw new Error("NFT not found in nfts table");

  // 4. Update status in DB
  const updatedListing = await mongoPrisma.nFTMarketplaceListing.update({
    where: { id: id },
    data: {
      status: "CANCEL_PENDING",
    },
  });

  // 5. Publish to RabbitMQ
  await publish("marketplace.cancel", {
    listingId: updatedListing.id,
    nftListingId: updatedListing.nftListingId,
    sellerAddress: ownerAddress,
  });

  return {
    listingId: updatedListing.id,
    nftId: nft.id,
    sellerId: seller.id,
    status: "CANCEL_PENDING",
  };
}
