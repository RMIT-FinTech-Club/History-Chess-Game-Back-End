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
    // Join game with ELO
    player1.emit('joinGame', { elo: 1500 });
});

player1.on('gameJoined', (data: { gameId: string, playerColor: string }) => {
    console.log('Player 1 joined game:', data);
    gameId = data.gameId;
    player1Color = data.playerColor;
});

player1.on('moveMade', (data: { fen: string, move: string }) => {
    console.log('Move made:', data);
});

player1.on('gameOver', (result) => {
    console.log('Game Over:', result);
});

// Player 2 listeners
player2.on('connect', () => {
    console.log('Player 2 connected');
    // Join game with similar ELO to match with player 1
    player2.emit('joinGame', { elo: 1250 });
});

player2.on('gameJoined', (data: { gameId: string, playerColor: string }) => {
    console.log('Player 2 joined game:', data);
    player2Color = data.playerColor;
});

// Simulate the fool's mate (shortest possible checkmate)
// setTimeout(() => {
//     if (player1Color === 'white') {
//         console.log('Player 1 (White) making move: f3');
//         player1.emit('makeMove', { gameId, move: 'f9' });
        
//         setTimeout(() => {
//             console.log('Player 2 (Black) making move: e5');
//             player2.emit('makeMove', { gameId, move: 'e5' });
            
//             setTimeout(() => {
//                 console.log('Player 1 (White) making move: g4');
//                 player1.emit('makeMove', { gameId, move: 'g4' });
                
//                 setTimeout(() => {
//                     console.log('Player 2 (Black) making move: Qh4#');
//                     player2.emit('makeMove', { gameId, move: 'Qh4' });
//                 }, 1000);
//             }, 1000);
//         }, 1000);
//     } 
    

    
// }, 2000);

// Handle errors
player1.on('error', (error) => {
    console.error('Player 1 error:', error);
});

player2.on('error', (error) => {
    console.error('Player 2 error:', error);
});


// Simulate different scenarios based on a scenario parameter
const simulateGame = (scenario: string) => {
    setTimeout(() => {
        if (player1Color === 'white') {
            switch (scenario) {
                case 'invalid_move':
                    // Try an invalid move
                    console.log('Testing invalid move scenario');
                    player1.emit('makeMove', { gameId, move: 'e9' }); // Invalid square
                    break;

                case 'insufficient_material':
                    // King vs King endgame
                    console.log('Testing insufficient material scenario');
                    const insufficientMaterialMoves = [
                        // Moves from the provided image
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
                    // Common stalemate position
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
                    // Three-fold repetition
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


simulateGame('checkmate'); 