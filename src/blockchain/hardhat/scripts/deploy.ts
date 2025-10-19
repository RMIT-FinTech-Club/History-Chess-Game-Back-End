import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();

  // Deploy NFT contract
  const NFT = await ethers.getContractFactory("NFT");
  const nft = await NFT.deploy("HistoryChessNFT", "HNFT");
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();

  // Deploy NFTMarketplace contract
  const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
  const marketplace = await NFTMarketplace.deploy();
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();

  // Display deployment summary
  console.log("Deployer:", deployer.address);
  console.log(
    "Account balance:",
    (await ethers.provider.getBalance(deployer.address)).toString()
  );
  console.log("NFT Contract:", nftAddress);
  console.log("Marketplace Contract:", marketplaceAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
