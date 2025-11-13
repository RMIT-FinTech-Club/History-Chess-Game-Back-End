// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Marketplace.sol";  // Assume in same folder or import path

contract NFTAdmin is ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;
    Marketplace public marketplace;

    constructor(address _marketplace) ERC721("VietnameseNFT", "VNFT") Ownable(msg.sender) {
        marketplace = Marketplace(_marketplace);
    }

    // Admin mints NFT with URI (metadata: name, image, rarity, dynasty, historical context)
    function mintNFT(address to, string memory tokenURI, uint256 price, uint256 minDynasty) public onlyOwner {
        uint256 tokenId = _tokenIdCounter++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        
        // Auto-list in marketplace
        _approve(address(marketplace), tokenId);
        marketplace.listItem(tokenId, price, minDynasty);
    }

    // Event for mint (verifiable)
    event NFTMinted(uint256 indexed tokenId, address to, string tokenURI);
}