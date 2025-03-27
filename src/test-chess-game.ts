import { io, Socket } from 'socket.io-client';

// Create two players
const player1 = io('http://localhost:8000');
const player2 = io('http://localhost:8000');

let gameId: string;
let player1Color: string;
let player2Color: string;

// Player 1 listeners
player1.on('connect', () => {
    console.log('Player 1 connected');
    player1.emit('joinGame', { userId: "38f09fb3-89df-44f3-a87f-1811325bfe1c" });
});

player1.on('gameJoined', (data: { gameId: string, playerColor: string }) => {
    console.log('Player 1 joined game:', data);
    gameId = data.gameId;
    player1Color = data.playerColor;
});

player1.on('moveMade', (data: { 
    fen: string, 
    move: string,
    gameState: {
        turn: string,
        inCheck: boolean,
        gameOver: boolean,
        whiteTimeLeft: number,
        blackTimeLeft: number
    }
}) => {
    console.log('Move made:', data);
    console.log('Current game state:', data.gameState);
});

player1.on('gameOver', (result: {
    status: string,
    reason: string,
    winner: string,
    winnerId: string,
    eloUpdate?: {
        whiteElo: number,
        blackElo: number
    }
}) => {
    console.log('Game Over:', result);
    if (result.eloUpdate) {
        console.log('ELO Updates:', result.eloUpdate);
    }
});

// Player 2 listeners
player2.on('connect', () => {
    console.log('Player 2 connected');
    player2.emit('joinGame', { userId: "64ca2824-056b-4f52-b75e-9924fee71eef" });
});

player2.on('gameJoined', (data: { gameId: string, playerColor: string }) => {
    console.log('Player 2 joined game:', data);
    player2Color = data.playerColor;
});

player2.on('moveMade', (data: {
    fen: string,
    move: string,
    gameState: {
        turn: string,
        inCheck: boolean,
        gameOver: boolean,
        whiteTimeLeft: number,
        blackTimeLeft: number
    }
}) => {
    console.log('Move made:', data);
    console.log('Current game state:', data.gameState);
});

player2.on('gameOver', (result: {
    status: string,
    reason: string,
    winner: string,
    winnerId: string,
    eloUpdate?: {
        whiteElo: number,
        blackElo: number
    }
}) => {
    console.log('Game Over:', result);
    if (result.eloUpdate) {
        console.log('ELO Updates:', result.eloUpdate);
    }
});

// Handle errors
player1.on('error', (error: { message: string, code?: string }) => {
    console.error('Player 1 error:', error);
});

player2.on('error', (error: { message: string, code?: string }) => {
    console.error('Player 2 error:', error);
});

// Simulate different scenarios based on a scenario parameter
const simulateGame = (scenario: string) => {
    setTimeout(() => {
        if (player1Color === 'white') {
            switch (scenario) {
                case 'invalid_move':
                    console.log('Testing invalid move scenario');
                    player1.emit('makeMove', { gameId, move: 'e9' });
                    break;

                case 'insufficient_material':
                    console.log('Testing insufficient material scenario');
                    const insufficientMaterialMoves = [
                        { player: player1, move: 'e4' },
                        { player: player2, move: 'd5' },
                        { player: player1, move: 'exd5' },
                        { player: player2, move: 'Qxd5' },
                        { player: player1, move: 'Bd3' },
                        { player: player2, move: 'Qxa2' },
                        { player: player1, move: 'Bxh7' },
                        { player: player2, move: 'Qxb1' },
                        { player: player1, move: 'Bxg8' },
                        { player: player2, move: 'Qxc2' },
                        { player: player1, move: 'Bxf7+' },
                        { player: player2, move: 'Kxf7' },
                        { player: player1, move: 'Rxa7' },
                        { player: player2, move: 'Qxc1' },
                        { player: player1, move: 'Rxb7' },
                        { player: player2, move: 'Rxh2' },
                        { player: player1, move: 'Rxb8' },
                        { player: player2, move: 'Rxg2' },
                        { player: player1, move: 'Qxc1' },
                        { player: player2, move: 'Rxg1+' },
                        { player: player1, move: 'Rxg1' },
                        { player: player2, move: 'Rxb8' },
                        { player: player1, move: 'Qxc7' },
                        { player: player2, move: 'Rxb2' },
                        // Additional moves from the second image
                        { player: player1, move: 'Qxc8' },
                        { player: player2, move: 'Rxd2' },
                        { player: player1, move: 'Qxf8+' },
                        { player: player2, move: 'Kxf8' },
                        { player: player1, move: 'Rxg7' },
                        { player: player2, move: 'Rxf2' },
                        { player: player1, move: 'Rxe7' },
                        { player: player2, move: 'Kxe7' },
                        { player: player1, move: 'Kxf2' }
                    ];
                    playMoveSequence(insufficientMaterialMoves);
                    break;

                case 'stalemate':
                    console.log('Testing stalemate scenario');
                    const stalemateMoves = [
                        { player: player1, move: 'e3' },
                        { player: player2, move: 'a5' },
                        { player: player1, move: 'Qh5' },
                        { player: player2, move: 'Ra6' },
                        { player: player1, move: 'Qxa5' },
                        { player: player2, move: 'h5' },
                        { player: player1, move: 'h4' },
                        { player: player2, move: 'Rah6' },
                        { player: player1, move: 'Qxc7' },
                        { player: player2, move: 'f6' },
                        { player: player1, move: 'Qxd7+' },
                        { player: player2, move: 'Kf7' },
                        { player: player1, move: 'Qxb7' },
                        { player: player2, move: 'Qd3' },
                        { player: player1, move: 'Qxb8' },
                        { player: player2, move: 'Qh7' },
                        { player: player1, move: 'Qxc8' },
                        { player: player2, move: 'Kg6' },
                        { player: player1, move: 'Qe6' } // This leads to stalemate
                    ];
                    playMoveSequence(stalemateMoves);
                    break;

                case 'repetition':
                    console.log('Testing repetition scenario');
                    const repetitionMoves = [
                        { player: player1, move: 'Nf3' },
                        { player: player2, move: 'Nf6' },
                        { player: player1, move: 'Ng1' },
                        { player: player2, move: 'Ng8' },
                        // Repeat two more times
                        { player: player1, move: 'Nf3' },
                        { player: player2, move: 'Nf6' },
                        { player: player1, move: 'Ng1' },
                        { player: player2, move: 'Ng8' },
                        { player: player1, move: 'Nf3' },
                        { player: player2, move: 'Nf6' },
                        { player: player1, move: 'Ng1' },
                        { player: player2, move: 'Ng8' }
                    ];
                    playMoveSequence(repetitionMoves);
                    break;

                case 'checkmate':
                    console.log('Testing checkmate scenario (fool\'s mate)');
                    const checkmateMoves = [
                        { player: player1, move: 'f3' },
                        { player: player2, move: 'e5' },
                        { player: player1, move: 'g4' },
                        { player: player2, move: 'Qh4' }
                    ];
                    playMoveSequence(checkmateMoves);
                    break;
            }
        }
    }, 2000);
};

const playMoveSequence = (moves: Array<{ player: Socket, move: string }>) => {
    moves.forEach((moveData, index) => {
        setTimeout(() => {
            console.log(`Making move: ${moveData.move}`);
            moveData.player.emit('makeMove', { gameId, move: moveData.move });
        }, index * 1000);
    });
};

// Start the test with checkmate scenario
simulateGame('checkmate');