import { postgresPrisma } from "../src/configs/prismaClient";
import * as dotenv from 'dotenv';

dotenv.config();

async function seedNeon() {
  try {
    console.log("Seeding data for NeonDB");
    const users = await postgresPrisma.users.createMany({
      data: [
        {
          username: "Alice",
          email: "alice@gmail.com",
          hashedPassword: "hashPasswordAllice",
          walletAddress: "0xPlayerAliceWallet",
          elo: 1500,
        },
        {
          username: "Emma",
          email: "emma@gmail.com",
          hashedPassword: "hashPasswordEmma",
          walletAddress: "0xPlayerEmmaWallet",
          elo: 1500,
        },
        {
          username: "Ben",
          email: "ben@gmail.com",
          hashedPassword: "hashPasswordBen",
          walletAddress: "0xPlayerBenWallet",
          elo: 1800,
        },
      ],
      skipDuplicates: true,
    });
    console.log(`${users.count} Users Created`);

    const nfts = await postgresPrisma.nfts.createMany({
      data: [
        {
          tokenId: "TOKEN-101",
          detailedInfo: {
            name: "Legendary Chess Board",
            image: "https://example.com/nft-image.png",
            rarity: "legendary",
          },
          mintedTime: new Date(),
        },
        {
          tokenId: "TOKEN-102",
          detailedInfo: {
            name: "Mystic Chess Piece",
            image: "https://example.com/nft-image2.png",
            rarity: "legendary",
          },
          mintedTime: new Date(),
        },
        {
          tokenId: "TOKEN-103",
          detailedInfo: {
            name: "Blabla",
            image: "https://example.com/nft-image3.png",
            rarity: "rare",
          },
          mintedTime: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    console.log(`${nfts.count} NFTs Created`);
  } catch (error) {
    console.error("Error while seeding NeonDB: ", error);
  } finally {
    await postgresPrisma.$disconnect();
  }
}

seedNeon();