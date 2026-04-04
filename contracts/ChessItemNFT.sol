// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChessItemNFT is ERC1155, Ownable {
    uint256 public nextTokenId = 1;
    mapping(uint256 => string) private _tokenURIs;

    constructor() ERC1155("") Ownable(msg.sender) {}

    // Ops can create a new item type
    function mintBatchItems(address to, uint256 amount, string memory tokenURI) external onlyOwner returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId, amount, "");
        _tokenURIs[tokenId] = tokenURI;
        return tokenId;
    }

    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        return _tokenURIs[tokenId];
    }
}
