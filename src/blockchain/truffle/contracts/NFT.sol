// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;

    event NFTMinted(
        address indexed to,
        uint256 indexed tokenId,
        string tokenURI
    );

    constructor(
        string memory name,
        string memory symbol
    ) ERC721(name, symbol) Ownable(msg.sender) {
        _tokenIdCounter = 0;
    }

    // Mint single NFT
    function mintTo(address to, string memory uri) external onlyOwner {
        require(to != address(0), "Invalid address");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _safeMint(to, tokenId);
        if (bytes(uri).length > 0) {
            _setTokenURI(tokenId, uri);
        }

        emit NFTMinted(to, tokenId, uri);
    }

    // Mint to multiple addresses (one each)
    function batchMintTo(
        address[] calldata recipients,
        string[] calldata uris
    ) external onlyOwner {
        require(recipients.length == uris.length, "Length mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid address");

            uint256 tokenId = _tokenIdCounter;
            _tokenIdCounter++;

            _safeMint(recipients[i], tokenId);
            if (bytes(uris[i]).length > 0) {
                _setTokenURI(tokenId, uris[i]);
            }

            emit NFTMinted(recipients[i], tokenId, uris[i]);
        }
    }

    // Mint multiple NFTs to one address
    function mintMultipleTo(address to, uint256 quantity) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(quantity > 0, "Quantity must be > 0");

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = _tokenIdCounter;
            _tokenIdCounter++;

            _safeMint(to, tokenId);
            emit NFTMinted(to, tokenId, "");
        }
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
