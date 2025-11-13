const { ethers } = require("hardhat");

async function main() {
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy("0xGameCoin", "0xItemNFT", "0xPlayerRegistry"); // Replace with actual addresses if separate
  console.log("Marketplace:", marketplace.address);

  const NFTAdmin = await ethers.getContractFactory("NFTAdmin");
  const nftAdmin = await NFTAdmin.deploy(marketplace.address);
  console.log("NFTAdmin:", nftAdmin.address);
}

main();