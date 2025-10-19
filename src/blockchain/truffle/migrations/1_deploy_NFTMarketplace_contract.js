/* eslint-disable no-undef, no-console */
const NFT = artifacts.require("NFT");
const NFTMarketplace = artifacts.require("NFTMarketplace");

module.exports = async function (deployer, network, accounts) {
  console.log("Network:", network);

  const [owner, seller1, buyer1] = accounts;

  const NFT_NAME = "HistoryChessNFT";
  const NFT_SYMBOL = "HNFT";
  const TOKEN_URI = "https://example.com/metadata/";

  // Deploy NFT contract with constructor parameters
  await deployer.deploy(NFT, NFT_NAME, NFT_SYMBOL);
  const nft = await NFT.deployed();
  console.log("NFT Contract Address:", nft.address);

  // Deploy NFTMarketplace contract
  await deployer.deploy(NFTMarketplace);
  const marketplace = await NFTMarketplace.deployed();
  console.log("NFTMarketplace Contract Address:", marketplace.address);

  // Mint a single NFT to seller1
  await nft.mintTo(seller1, TOKEN_URI);
  const ownerOf0 = await nft.ownerOf(0);
  console.log(`Token 0 owned by address: ${ownerOf0}`);

  // Mint multiple NFTs to seller1
  await nft.mintMultipleTo(seller1, 4);

  // Set approval for marketplace (called from seller1's account)
  await nft.setApprovalForAll(marketplace.address, true, { from: seller1 });

  console.log("Owner:", owner);
  console.log("Seller1:", seller1);
  console.log("Buyer1:", buyer1);
};
