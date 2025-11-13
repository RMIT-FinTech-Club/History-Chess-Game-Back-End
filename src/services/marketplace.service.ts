import { ethers } from "ethers";
import { postgresPrisma } from "../configs/prismaClient";  // Prisma for Neon (nfts)
import { Games } from "../models/GameSession";  // Mongoose for Mongo (MarketplaceListings; adjust if model name differs)
import { NFTMetadata } from "../types/nft.types";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.GANACHE_URL);
const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

// ABI for NFTAdmin (mintNFT)
const nftAdminABI = [
  "function mintNFT(address to, string memory tokenURI) public returns (uint256)",
  "event NFTMinted(uint256 indexed tokenId, address to, string tokenURI)"
];

// ABI for Marketplace (listItem)
const marketplaceABI = [
  "function listItem(uint256 tokenId, uint256 price, uint256 minDynasty) public",
  "event ItemListed(uint256 indexed tokenId, address seller, uint256 price, uint256 minDynasty)"
];

const nftAdminContract = new ethers.Contract(process.env.NFTADMIN_ADDRESS, nftAdminABI, adminWallet);
const marketplaceContract = new ethers.Contract(process.env.MARKETPLACE_ADDRESS, marketplaceABI, adminWallet);

// Function to call Solidity mintNFT
export async function callMintNFT(to: string, tokenURI: string): Promise<{ txHash: string; tokenId: string }> {
  try {
    // Validate inputs
    if (!ethers.utils.isAddress(to)) throw new Error("Invalid address");
    if (!tokenURI) throw new Error("Missing tokenURI");

    // Call contract
    const tx = await nftAdminContract.mintNFT(to, tokenURI);
    const receipt = await tx.wait();

    // Extract tokenId from event
    const event = receipt.events.find(e => e.event === "NFTMinted");
    if (!event) throw new Error("NFTMinted event not found");
    const tokenId = event.args.tokenId.toString();

    console.log(`Mint Tx Hash: ${receipt.transactionHash}`);  // Log for explorer
    return { txHash: receipt.transactionHash, tokenId };
  } catch (error) {
    console.error("callMintNFT failed:", error.message);
    throw new Error("Failed to call mintNFT on blockchain");
  }
}

// Function to call Solidity listItem
export async function callListItem(tokenId: string, price: number, minDynasty: number): Promise<string> {
  try {
    // Validate inputs
    if (isNaN(price) || price <= 0) throw new Error("Invalid price");
    if (isNaN(minDynasty) || minDynasty < 0) throw new Error("Invalid minDynasty");

    // Call contract
    const tx = await marketplaceContract.listItem(tokenId, ethers.utils.parseEther(price.toString()), minDynasty);
    const receipt = await tx.wait();

    // Confirm event
    const event = receipt.events.find(e => e.event === "ItemListed");
    if (!event) throw new Error("ItemListed event not found");

    console.log(`List Tx Hash: ${receipt.transactionHash}`);  // Log for explorer
    return receipt.transactionHash;
  } catch (error) {
    console.error("callListItem failed:", error.message);
    throw new Error("Failed to call listItem on blockchain");
  }
}

// Orchestration function for upload (calls above, syncs DB)
export async function uploadNFTItem(adminId: string, data: NFTMetadata): Promise<{ mintTxHash: string; listTxHash: string; tokenId: string }> {
  try {
    // Validate data
    if (!data.name || !data.imageUrl || !data.rarity || !data.dynasty || !data.history || !data.price) {
      throw new Error("Missing required fields");
    }

    // Check admin
    const user = await postgresPrisma.users.findUnique({ where: { id: adminId } });
    if (!user || user.role !== "admin") {
      throw new Error("Not authorized as admin");
    }

    // Create tokenURI (JSON metadata)
    const tokenURI = JSON.stringify(data);

    // Call mint
    const { txHash: mintTxHash, tokenId } = await callMintNFT(adminWallet.address, tokenURI);

    // Call list
    const listTxHash = await callListItem(tokenId, data.price, data.dynasty);

    // Sync Prisma (Neon - nfts)
    await postgresPrisma.nfts.create({
      data: {
        tokenId,
        ownerId: process.env.MARKETPLACE_ADDRESS,  // Owned by marketplace
        detailedInfo: tokenURI  // JSON
      }
    });

    // Sync Mongo (MarketplaceListings)
    await Games.collection.insertOne({  // Assume Games model for Mongo; adjust if different
      nftId: tokenId,
      sellerId: adminId,
      price: data.price,
      status: "OPEN",
      startTime: new Date(),
    });

    return { mintTxHash, listTxHash, tokenId };
  } catch (error) {
    throw new Error(error.message);
  }
}

// Setup event listeners for DB sync (call in server.ts)
export function setupEventListeners() {
  nftAdminContract.on("NFTMinted", async (tokenId, to, tokenURI) => {
    await postgresPrisma.nfts.update({
      where: { tokenId: tokenId.toString() },
      data: { detailedInfo: tokenURI }
    });
    console.log("Neon DB synced from NFTMinted event");
  });

  marketplaceContract.on("ItemListed", async (tokenId, seller, price, minDynasty) => {
    await Games.collection.updateOne(
      { nftId: tokenId.toString() },
      { $set: { price: price.toNumber(), minDynasty: minDynasty.toNumber() } }
    );
    console.log("Mongo DB synced from ItemListed event");
  });
}