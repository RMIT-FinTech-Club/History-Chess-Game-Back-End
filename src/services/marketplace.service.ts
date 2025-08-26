import { Contract, formatEther, parseEther } from 'ethers';
import { Log } from 'ethers'; // Import the Log type for better type safety

// Define the interface for your contract instances to ensure type safety
interface MarketplaceContracts {
    nftMarketplaceContract: Contract;
    basicNftContract: Contract;
}

/**
 * Service to interact with the NFT Marketplace smart contracts.
 */
export const marketplaceService = {

    /**
     * Fetches a single listing from the marketplace.
     * @param contracts The marketplace contract instances.
     * @param nftAddress The address of the NFT contract.
     * @param tokenId The ID of the NFT token.
     * @returns The listing details.
     */
    getListing: async (contracts: MarketplaceContracts, nftAddress: string, tokenId: number) => {
        const { nftMarketplaceContract, basicNftContract } = contracts;

        try {
            const listing = await nftMarketplaceContract.getListing(nftAddress, tokenId);
            
            // Check if the listing exists and is a valid address
            if (listing.seller === "0x0000000000000000000000000000000000000000") {
                return null;
            }

            // Get the owner's address
            const owner = await basicNftContract.ownerOf(tokenId);

            return {
                price: formatEther(listing.price),
                seller: listing.seller,
                owner: owner
            };
        } catch (error) {
            console.error('Error in marketplaceService.getListing:', error);
            throw new Error('Failed to fetch listing from blockchain.');
        }
    },

    /**
     * Mints a new NFT and then lists it for sale on the marketplace.
     * The function now returns the nftAddress and tokenId.
     * @param contracts The marketplace contract instances.
     * @param priceInEth The price in ETH as a string.
     * @returns An object containing the transaction hash, nftAddress, and tokenId.
     */
    mintAndListNft: async (contracts: MarketplaceContracts, priceInEth: string) => {
        const { nftMarketplaceContract, basicNftContract } = contracts;

        try {
            // Step 1: Mint the NFT to the owner's address
            console.log("Minting a new NFT...");
            const mintTx = await basicNftContract.mintNft();
            const mintTxReceipt = await mintTx.wait(1);

            // The correct way to find the tokenId is by parsing the events from the mint transaction.
            const mintEvent = mintTxReceipt?.logs.find(
                (log: Log) => log.address === basicNftContract.target
            );
            const parsedMintLog = basicNftContract.interface.parseLog(mintEvent as Log);
            const mintedTokenId = parsedMintLog?.args.tokenId;
            
            console.log(`NFT minted with Token ID: ${mintedTokenId}`);
            
            // Step 2: Approve the marketplace contract to manage the newly minted NFT
            console.log("Approving marketplace...");
            const marketplaceAddress = await nftMarketplaceContract.getAddress();
            const approvalTx = await basicNftContract.approve(
                marketplaceAddress,
                mintedTokenId
            );
            await approvalTx.wait(1);

            // Step 3: List the NFT for sale on the marketplace
            console.log("Listing NFT on marketplace...");
            const listingTx = await nftMarketplaceContract.listItem(
                basicNftContract.getAddress(),
                mintedTokenId,
                parseEther(priceInEth)
            );
            const listingTxReceipt = await listingTx.wait(1);

            // Step 4: Find the event and return the necessary data
            const listedEvent = listingTxReceipt?.logs.find(
                (log: Log) => log.address === nftMarketplaceContract.target
            );
            const parsedListedLog = nftMarketplaceContract.interface.parseLog(listedEvent as Log);
            const listedNftAddress = parsedListedLog?.args.nftAddress;
            const listedTokenId = parsedListedLog?.args.tokenId;
            
            console.log(`NFT with Token ID ${listedTokenId} listed successfully.`);
            
            return {
                transactionHash: listingTx.hash,
                nftAddress: listedNftAddress,
                tokenId: listedTokenId.toString()
            };
        } catch (error) {
            console.error('Error in marketplaceService.mintAndListNft:', error);
            throw new Error('Failed to mint and list NFT.');
        }
    },
    
    // The getAllListings function remains the same for now
    getAllListings: async () => {
        const mockListings = [
            {
                nftAddress: "0x795C26902f260C8270862cD4465716f4666b0B2C",
                tokenId: 0,
                price: "10.0",
                seller: "0x...",
            },
            {
                nftAddress: "0x795C26902f260C8270862cD4465716f4666b0B2C",
                tokenId: 1,
                price: "5.0",
                seller: "0x...",
            },
        ];
        return mockListings;
    },
};
