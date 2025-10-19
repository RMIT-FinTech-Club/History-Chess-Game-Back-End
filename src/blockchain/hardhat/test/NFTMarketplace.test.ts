import { expect } from "chai";
import { network } from "hardhat";
import { NFT, NFTMarketplace } from "../types/ethers-contracts/index.js";
import { Signer } from "ethers";

const { ethers } = await network.connect();

describe("NFT and NFTMarketplace Contracts", function () {
  let nft: NFT;
  let marketplace: NFTMarketplace;
  let owner: Signer;
  let seller1: Signer;
  // let seller2: Signer;
  let buyer: Signer;
  let address1: Signer;

  const NFT_NAME = "HistoryChessNFT";
  const NFT_SYMBOL = "HNFT";
  const TOKEN_URI = "https://example.com/metadata/1";

  beforeEach(async function () {
    [owner, seller1, buyer, address1] = await ethers.getSigners();

    // Deploy NFT contract
    const NFT = await ethers.getContractFactory("NFT");
    nft = await NFT.deploy(NFT_NAME, NFT_SYMBOL);
    await nft.waitForDeployment();

    // Deploy NFTMarketplace contract
    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    marketplace = await NFTMarketplace.deploy();
    await marketplace.waitForDeployment();

    // const nftAddress = await nft.getAddress();
    // const marketplaceAddress = await marketplace.getAddress();

    // console.log("Owner:", await owner.getAddress());
    // console.log(
    //   "Account balance:",
    //   (await ethers.provider.getBalance(await owner.getAddress())).toString()
    // );
    // console.log("NFT Contract:", nftAddress);
    // console.log("Marketplace Contract:", marketplaceAddress);
  });

  describe("NFT Contract", function () {
    // describe("Deployment", function () {
    //   it("Should set the correct name and symbol", async function () {
    //     expect(await nft.name()).to.equal(NFT_NAME);
    //     expect(await nft.symbol()).to.equal(NFT_SYMBOL);
    //   });

    //   it("Should set the correct owner", async function () {
    //     expect(await nft.owner()).to.equal(await owner.getAddress());
    //   });

    it("Should initialize token counter to 0", async function () {
      await nft.mintTo(await seller1.getAddress(), TOKEN_URI);
      expect(await nft.ownerOf(0)).to.equal(await seller1.getAddress());
    });
    // });

    describe("Minting", function () {
      it("Should mint NFT to specified address", async function () {
        await expect(nft.mintTo(await seller1.getAddress(), TOKEN_URI))
          .to.emit(nft, "NFTMinted")
          .withArgs(await seller1.getAddress(), 0, TOKEN_URI);
        await expect(nft.mintTo(await seller1.getAddress(), TOKEN_URI))
          .to.emit(nft, "NFTMinted")
          .withArgs(await seller1.getAddress(), 1, TOKEN_URI);

        expect(await nft.ownerOf(0)).to.equal(await seller1.getAddress());
        expect(await nft.ownerOf(1)).to.equal(await seller1.getAddress());
        expect(await nft.tokenURI(0)).to.equal(TOKEN_URI);
        expect(await nft.tokenURI(1)).to.equal(TOKEN_URI);
      });

      it("Should mint NFT without URI", async function () {
        await nft.mintTo(await seller1.getAddress(), "");
        expect(await nft.ownerOf(0)).to.equal(await seller1.getAddress());
      });

      it("Should fail to mint to zero address", async function () {
        await expect(
          nft.mintTo(ethers.ZeroAddress, TOKEN_URI)
        ).to.be.revertedWith("Invalid address");
      });

      it("Should fail when non-owner tries to mint", async function () {
        console.log("Owner:", await owner.getAddress());
        await expect(
          nft.connect(seller1).mintTo(await seller1.getAddress(), TOKEN_URI)
        )
          .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
          .withArgs(await seller1.getAddress());
      });

      it("Should batch mint to multiple addresses", async function () {
        const recipients = [
          await seller1.getAddress(),
          await buyer.getAddress(),
          await address1.getAddress(),
        ];
        const uris = [TOKEN_URI, TOKEN_URI + "2", TOKEN_URI + "3"];

        await nft.batchMintTo(recipients, uris);

        expect(await nft.ownerOf(0)).to.equal(await seller1.getAddress());
        expect(await nft.ownerOf(1)).to.equal(await buyer.getAddress());
        expect(await nft.ownerOf(2)).to.equal(await address1.getAddress());
        expect(await nft.tokenURI(1)).to.equal(TOKEN_URI + "2");
      });

      it("Should fail batch mint with mismatched arrays", async function () {
        const recipients = [
          await seller1.getAddress(),
          await buyer.getAddress(),
        ];
        const uris = [TOKEN_URI];

        await expect(nft.batchMintTo(recipients, uris)).to.be.revertedWith(
          "Length mismatch"
        );
      });

      it("Should mint multiple NFTs to one address", async function () {
        const quantity = 3;
        await nft.mintMultipleTo(await seller1.getAddress(), quantity);

        for (let i = 0; i < quantity; i++) {
          expect(await nft.ownerOf(i)).to.equal(await seller1.getAddress());
        }
      });

      it("Should fail to mint zero quantity", async function () {
        await expect(
          nft.mintMultipleTo(await seller1.getAddress(), 0)
        ).to.be.revertedWith("Quantity must be > 0");
      });
    });

    describe("Token URI", function () {
      it("Should return correct token URI", async function () {
        await nft.mintTo(await seller1.getAddress(), TOKEN_URI);
        expect(await nft.tokenURI(0)).to.equal(TOKEN_URI);
      });

      it("Should return empty string for token without URI", async function () {
        await nft.mintTo(await seller1.getAddress(), "");
        expect(await nft.tokenURI(0)).to.equal("");
      });
    });
  });

  describe("NFTMarketplace Contract", function () {
    beforeEach(async function () {
      // Mint some NFTs for testing
      await nft.mintTo(await seller1.getAddress(), TOKEN_URI);
      await nft.mintTo(await seller1.getAddress(), TOKEN_URI + "2");
      await nft.mintTo(await buyer.getAddress(), TOKEN_URI + "3");
    });

    describe("Listing Creation", function () {
      it("Should create a listing successfully", async function () {
        const price = ethers.parseEther("1.0");

        // Approve marketplace to transfer NFT
        await nft.connect(seller1).approve(await marketplace.getAddress(), 0);

        const tx = await marketplace
          .connect(seller1)
          .createListing(await nft.getAddress(), 0, price);

        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const timestamp = block!.timestamp;

        await expect(tx)
          .to.emit(marketplace, "ListingCreated")
          .withArgs(
            1, // listingId
            await nft.getAddress(),
            0, // tokenId
            price,
            0, // ListingStatus.ON_SALE
            await seller1.getAddress(),
            timestamp
          );

        const listing = await marketplace.getListing(1);
        expect(listing.nftContractAddress).to.equal(await nft.getAddress());
        expect(listing.tokenId).to.equal(0);
        expect(listing.price).to.equal(price);
        expect(listing.status).to.equal(0); // ON_SALE
        expect(listing.seller).to.equal(await seller1.getAddress());
      });

      it("Should fail to create listing without approval", async function () {
        const price = ethers.parseEther("1.0");

        await expect(
          marketplace
            .connect(seller1)
            .createListing(await nft.getAddress(), 0, price)
        ).to.be.revertedWith("Marketplace not approved to transfer NFT");
      });

      it("Should fail to create listing for NFT not owned by caller", async function () {
        const price = ethers.parseEther("1.0");

        // buyer tries to list tokenId 0, but does not own it
        await expect(
          marketplace
            .connect(buyer)
            .createListing(await nft.getAddress(), 1, price)
        ).to.be.revertedWith("You are not the owner of this NFT");
      });

      it("Should fail to create listing with zero price", async function () {
        await nft.connect(seller1).approve(await marketplace.getAddress(), 0);

        await expect(
          marketplace
            .connect(seller1)
            .createListing(await nft.getAddress(), 0, 0)
        ).to.be.revertedWith("Price must be greater than 0");
      });

      it("Should create listing with setApprovalForAll", async function () {
        const price = ethers.parseEther("1.0");

        // Use setApprovalForAll instead of approve
        await nft
          .connect(seller1)
          .setApprovalForAll(await marketplace.getAddress(), true);

        await expect(
          marketplace
            .connect(seller1)
            .createListing(await nft.getAddress(), 1, price)
        ).to.emit(marketplace, "ListingCreated");
      });
    });

    describe("Listing Purchase", function () {
      beforeEach(async function () {
        // Create a listing
        await nft.connect(seller1).approve(await marketplace.getAddress(), 0);

        await marketplace
          .connect(seller1)
          .createListing(await nft.getAddress(), 0, ethers.parseEther("1.0"));
      });

      it("Should purchase listing successfully", async function () {
        const price = ethers.parseEther("1.0");
        const sellerBalanceBefore = await ethers.provider.getBalance(
          await seller1.getAddress()
        );

        const tx = await marketplace
          .connect(buyer)
          .purchaseListing(1, { value: price });

        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const timestamp = block!.timestamp;

        await expect(tx)
          .to.emit(marketplace, "ListingPurchased")
          .withArgs(
            1, // listingId
            await nft.getAddress(),
            0, // tokenId
            price,
            1, // ListingStatus.SOLD
            await seller1.getAddress(),
            await buyer.getAddress(),
            timestamp
          );

        // Check NFT ownership transfer
        expect(await nft.ownerOf(0)).to.equal(await buyer.getAddress());

        // Check listing status
        const listing = await marketplace.getListing(1);
        expect(listing.status).to.equal(1); // SOLD
        expect(listing.buyer).to.equal(await buyer.getAddress());

        // Check ETH transfer to seller1
        const sellerBalanceAfter = await ethers.provider.getBalance(
          await seller1.getAddress()
        );
        expect(sellerBalanceAfter).to.be.gt(sellerBalanceBefore);
      });

      it("Should fail to purchase with incorrect payment", async function () {
        const wrongPrice = ethers.parseEther("0.5");

        await expect(
          marketplace.connect(buyer).purchaseListing(1, { value: wrongPrice })
        ).to.be.revertedWith("Incorrect payment amount");
      });

      it("Should fail to purchase non-existent listing", async function () {
        const price = ethers.parseEther("1.0");

        await expect(
          marketplace.connect(buyer).purchaseListing(999, { value: price })
        ).to.be.revertedWith("Listing does not exist");
      });

      it("Should fail when seller1 tries to buy their own NFT", async function () {
        const price = ethers.parseEther("1.0");

        await expect(
          marketplace.connect(seller1).purchaseListing(1, { value: price })
        ).to.be.revertedWith("Seller cannot buy their own NFT");
      });

      it("Should fail to purchase already sold listing", async function () {
        const price = ethers.parseEther("1.0");

        // First purchase
        await marketplace.connect(buyer).purchaseListing(1, { value: price });

        // Try to purchase again
        await expect(
          marketplace.connect(address1).purchaseListing(1, { value: price })
        ).to.be.revertedWith("This item is no longer On Sale");
      });
    });

    describe("Listing Cancellation", function () {
      beforeEach(async function () {
        // Create a listing
        await nft.connect(seller1).approve(await marketplace.getAddress(), 1);
        await marketplace
          .connect(seller1)
          .createListing(await nft.getAddress(), 1, ethers.parseEther("1.0"));
      });

      it("Should cancel listing successfully", async function () {
        const tx = await marketplace.connect(seller1).cancelListing(1);
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt!.blockNumber);
        const timestamp = block!.timestamp;

        await expect(tx)
          .to.emit(marketplace, "ListingCancelled")
          .withArgs(
            1, // listingId
            await nft.getAddress(),
            1, // tokenId
            ethers.parseEther("1.0"),
            2, // ListingStatus.CANCELLED
            await seller1.getAddress(),
            timestamp
          );

        const listing = await marketplace.getListing(1);
        expect(listing.status).to.equal(2); // CANCELLED
      });

      it("Should fail to cancel non-existent listing", async function () {
        await expect(
          marketplace.connect(seller1).cancelListing(999)
        ).to.be.revertedWith("Listing does not exist");
      });

      it("Should fail when non-seller1 tries to cancel", async function () {
        await expect(
          marketplace.connect(buyer).cancelListing(1)
        ).to.be.revertedWith("Only seller can cancel listing");
      });

      it("Should fail to cancel already sold listing", async function () {
        const price = ethers.parseEther("1.0");

        // Purchase the listing first
        await marketplace.connect(buyer).purchaseListing(1, { value: price });

        // Try to cancel
        await expect(
          marketplace.connect(seller1).cancelListing(1)
        ).to.be.revertedWith("This item is not on listing");
      });

      it("Should fail to cancel already cancelled listing", async function () {
        // Cancel once
        await marketplace.connect(seller1).cancelListing(1);

        // Try to cancel again
        await expect(
          marketplace.connect(seller1).cancelListing(1)
        ).to.be.revertedWith("This item is not on listing");
      });
    });

    describe("Listing Information", function () {
      it("Should return correct listing details", async function () {
        const price = ethers.parseEther("1.0");

        await nft.connect(seller1).approve(await marketplace.getAddress(), 0);
        await marketplace
          .connect(seller1)
          .createListing(await nft.getAddress(), 0, price);

        const listing = await marketplace.getListing(1);
        expect(listing.nftContractAddress).to.equal(await nft.getAddress());
        expect(listing.tokenId).to.equal(0);
        expect(listing.price).to.equal(price);
        expect(listing.status).to.equal(0); // ON_SALE
        expect(listing.seller).to.equal(await seller1.getAddress());
        expect(listing.buyer).to.equal(ethers.ZeroAddress);
        expect(listing.listingCreateTimestamp).to.be.gt(0);
        expect(listing.listingPurchaseTimestamp).to.equal(0);
        expect(listing.listingCancelTimestamp).to.equal(0);
      });

      it("Should return current listing ID", async function () {
        expect(await marketplace.listingId()).to.equal(0);

        await nft.connect(seller1).approve(await marketplace.getAddress(), 0);
        await marketplace
          .connect(seller1)
          .createListing(await nft.getAddress(), 0, ethers.parseEther("1.0"));

        expect(await marketplace.listingId()).to.equal(1);
      });
    });

    describe("Integration Tests", function () {
      it("Should handle complete marketplace flow", async function () {
        const price = ethers.parseEther("2.0");

        // 1. Create listing
        await nft.connect(seller1).approve(await marketplace.getAddress(), 0);
        await marketplace
          .connect(seller1)
          .createListing(await nft.getAddress(), 0, price);

        // 2. Verify listing
        let listing = await marketplace.getListing(1);
        expect(listing.status).to.equal(0); // ON_SALE

        // 3. Purchase listing
        await marketplace.connect(buyer).purchaseListing(1, { value: price });

        // 4. Verify purchase
        listing = await marketplace.getListing(1);
        expect(listing.status).to.equal(1); // SOLD
        expect(listing.buyer).to.equal(await buyer.getAddress());
        expect(await nft.ownerOf(0)).to.equal(await buyer.getAddress());
      });

      it("Should handle multiple listings", async function () {
        const price1 = ethers.parseEther("1.0");
        const price2 = ethers.parseEther("2.0");

        // Create two listings
        await nft.connect(seller1).approve(await marketplace.getAddress(), 0);
        await nft.connect(seller1).approve(await marketplace.getAddress(), 1);

        await marketplace
          .connect(seller1)
          .createListing(await nft.getAddress(), 0, price1);
        await marketplace
          .connect(seller1)
          .createListing(await nft.getAddress(), 1, price2);

        // Purchase first listing
        await marketplace.connect(buyer).purchaseListing(1, { value: price1 });

        // Cancel second listing
        await marketplace.connect(seller1).cancelListing(2);

        // Verify states
        const listing1 = await marketplace.getListing(1);
        const listing2 = await marketplace.getListing(2);

        expect(listing1.status).to.equal(1); // SOLD
        expect(listing2.status).to.equal(2); // CANCELLED
        expect(await nft.ownerOf(0)).to.equal(await buyer.getAddress());
        expect(await nft.ownerOf(1)).to.equal(await seller1.getAddress());
      });
    });
  });
});
