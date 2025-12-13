pragma solidity ^0.8.0;

contract EloManager {
    mapping(address => uint256) private elos;

    event EloSet(address indexed player, uint256 elo);
    event EloIncreased(address indexed player, uint256 newElo, uint256 amount);
    event EloDecreased(address indexed player, uint256 newElo, uint256 amount);

    function setElo(address player, uint256 elo) public {
        elos[player] = elo;
        emit EloSet(player, elo);
    }

    function increaseElo(address player, uint256 amount) public {
        elos[player] += amount;
        emit EloIncreased(player, elos[player], amount);
    }

    function decreaseElo(address player, uint256 amount) public {
        require(elos[player] >= amount, "Elo cannot go below zero");
        elos[player] -= amount;
        emit EloDecreased(player, elos[player], amount);
    }

    function updateAfterGame(
        address playerA,
        uint256 newEloA,
        address playerB,
        uint256 newEloB
    ) public {
        elos[playerA] = newEloA;
        elos[playerB] = newEloB;
        emit EloSet(playerA, newEloA);
        emit EloSet(playerB, newEloB);
    }

    function getElo(address player) public view returns (uint256) {
        uint256 elo = elos[player];
        if (elo == 0) {
            return 1500;
        }
        return elo;
    }
} 