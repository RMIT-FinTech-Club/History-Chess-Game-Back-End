// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GameCoin {
    mapping(address => uint256) private _balances;
    address public owner;

    event MatchWin(address indexed player, uint256 reward, string matchType);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    function rewardPvPWin(address player) external onlyOwner {
        // Assume 10 coins for PvP
        uint256 amount = 10 * 10**18;
        _balances[player] += amount;
        emit MatchWin(player, amount, "PvP");
    }

    function rewardBotWin(address player) external onlyOwner {
        // Assume 5 coins for Bot
        uint256 amount = 5 * 10**18;
        _balances[player] += amount;
        emit MatchWin(player, amount, "Bot");
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }
}
