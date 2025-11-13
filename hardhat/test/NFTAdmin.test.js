const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTAdmin Tests", function () {
  let nftAdmin, marketplace, admin, user;

  before(async function () {
    [admin, user] = await ethers.getSigners();

    const Marketplace = await ethers.getContractFactory("Marketplace");
    marketplace = await Marketplace.deploy("0xStubCoin", "0xStubNFT", "0xStubRegistry");

    const NFTAdmin = await ethers.getContractFactory("NFTAdmin");
    nftAdmin = await NFTAdmin.deploy(marketplace.address);
  });

  it("Admin can mint and list NFT", async function () {
    const tokenURI = "ipfs://metadata";
    const price = ethers.utils.parseEther("100");
    const minDynasty = 3;

    await expect(nftAdmin.connect(admin).mintNFT(user.address, tokenURI, price, minDynasty))
      .to.emit(nftAdmin, "NFTMinted")
      .withArgs(0, user.address, tokenURI);

    const listing = await marketplace.listings(0);
    expect(listing.price).to.equal(price);
    expect(listing.minDynasty).to.equal(minDynasty);
    expect(listing.active).to.be.true;
  });

  it("Non-admin cannot mint", async function () {
    await expect(nftAdmin.connect(user).mintNFT(user.address, "uri", 100, 3)).to.be.revertedWith("Ownable: caller is not the owner");
  });
});