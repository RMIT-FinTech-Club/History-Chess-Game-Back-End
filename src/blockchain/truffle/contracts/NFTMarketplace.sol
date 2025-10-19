// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NFTMarketplace is ReentrancyGuard {
    enum ListingStatus {
        ON_SALE,
        PURCHASED,
        CANCELLED
    }

    struct Listing {
        address nftContractAddress;
        uint256 tokenId;
        uint256 price;
        ListingStatus status;
        address sellerAddress;
        address buyerAddress;
        uint256 createTimestamp;
        uint256 purchaseTimestamp;
        uint256 cancelTimestamp;
    }

    uint256 public listingId;
    mapping(uint256 => Listing) public listings;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed nftContractAddress,
        uint256 indexed tokenId,
        uint256 price,
        ListingStatus status,
        address sellerAddress,
        uint256 createTimestamp
    );

    event ListingPurchased(
        uint256 indexed listingId,
        address indexed nftContractAddress,
        uint256 indexed tokenId,
        uint256 price,
        ListingStatus status,
        address sellerAddress,
        address buyerAddress,
        uint256 purchaseTimestamp
    );

    event ListingCancelled(
        uint256 indexed listingId,
        address indexed nftContractAddress,
        uint256 indexed tokenId,
        uint256 price,
        ListingStatus status,
        address sellerAddress,
        uint256 cancelTimestamp
    );

    function createListing(
        address nftContractAddress,
        uint256 tokenId,
        uint256 price
    ) external {
        // Preconditions
        require(
            IERC721(nftContractAddress).ownerOf(tokenId) == msg.sender,
            "You are not the owner of this NFT"
        );
        require(
            IERC721(nftContractAddress).getApproved(tokenId) == address(this) ||
                IERC721(nftContractAddress).isApprovedForAll(
                    msg.sender,
                    address(this)
                ),
            "Marketplace not approved to transfer NFT"
        );
        require(price > 0, "Price must be greater than 0");

        // Effects
        listingId++;

        listings[listingId] = Listing({
            nftContractAddress: nftContractAddress,
            tokenId: tokenId,
            price: price,
            status: ListingStatus.ON_SALE,
            sellerAddress: msg.sender,
            buyerAddress: address(0),
            createTimestamp: block.timestamp,
            purchaseTimestamp: 0,
            cancelTimestamp: 0
        });

        // Events
        emit ListingCreated(
            listingId,
            nftContractAddress,
            tokenId,
            price,
            ListingStatus.ON_SALE,
            msg.sender,
            block.timestamp
        );
    }

    function purchaseListing(uint256 _listingId) external payable nonReentrant {
        Listing storage listing = listings[_listingId];

        // Preconditions
        require(listing.sellerAddress != address(0), "Listing does not exist");
        require(
            msg.sender != listing.sellerAddress,
            "Seller cannot buy their own NFT"
        );
        require(
            listing.status == ListingStatus.ON_SALE,
            "This item is no longer On Sale"
        );
        require(msg.value == listing.price, "Incorrect payment amount");

        // Effects
        listing.status = ListingStatus.PURCHASED;
        listing.buyerAddress = msg.sender;
        listing.purchaseTimestamp = block.timestamp;

        // Transfer ETH to seller
        (bool success, ) = payable(listing.sellerAddress).call{
            value: msg.value
        }("");
        require(success, "ETH transfer failed");

        // Transfer NFT to buyer
        IERC721(listing.nftContractAddress).safeTransferFrom(
            listing.sellerAddress,
            msg.sender,
            listing.tokenId
        );

        // Events
        emit ListingPurchased(
            _listingId,
            listing.nftContractAddress,
            listing.tokenId,
            listing.price,
            ListingStatus.PURCHASED,
            listing.sellerAddress,
            msg.sender,
            block.timestamp
        );
    }

    function cancelListing(uint256 _listingId) external {
        Listing storage listing = listings[_listingId];

        // Preconditions
        require(listing.sellerAddress != address(0), "Listing does not exist");
        require(
            listing.status == ListingStatus.ON_SALE,
            "This item is not on listing"
        );
        require(
            msg.sender == listing.sellerAddress,
            "Only seller can cancel listing"
        );

        // Effects
        listing.status = ListingStatus.CANCELLED;
        listing.cancelTimestamp = block.timestamp;

        // Events
        emit ListingCancelled(
            _listingId,
            listing.nftContractAddress,
            listing.tokenId,
            listing.price,
            ListingStatus.CANCELLED,
            listing.sellerAddress,
            block.timestamp
        );
    }

    // function getListing(
    //     uint256 _listingId
    // )
    //     external
    //     view
    //     returns (
    //         address nftContractAddress,
    //         uint256 tokenId,
    //         address seller,
    //         address buyer,
    //         uint256 price,
    //         ListingStatus status,
    //         uint256 createTimestamp,
    //         uint256 purchaseTimestamp,
    //         uint256 cancelTimestamp
    //     )
    // {
    //     Listing memory listing = listings[_listingId];
    //     return (
    //         listing.nftContractAddress,
    //         listing.tokenId,
    //         listing.sellerAddress,
    //         listing.buyerAddress,
    //         listing.price,
    //         listing.status,
    //         listing.createTimestamp,
    //         listing.purchaseTimestamp,
    //         listing.cancelTimestamp
    //     );
    // }
}
