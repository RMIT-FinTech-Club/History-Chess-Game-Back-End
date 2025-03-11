import { Socket, Server as SocketIOServer } from 'socket.io';
import { Chess } from 'chess.js';

interface GameSession {
    gameId: string;
    playerSockets: Socket[];
    gameState: string;
}

interface WaitingPlayer {
    socket: Socket;
    elo: number;
}



const gameSessions: { [gameId: string]: GameSession } = {};
const waitingPlayers: WaitingPlayer[] = [];

const generateGameId = (): string => {
    return Math.random().toString(36).substring(2, 15);
}

export const createNewGameSession = (socket1: Socket, socket2: Socket): GameSession => {
    const gameId = generateGameId()
    const newGame: GameSession = {
        gameId: gameId,
        playerSockets: [socket1, socket2],
        gameState: new Chess().fen(),
    }
    gameSessions[gameId] = newGame
    return newGame
}

export const joinGame = (socket: Socket, io: SocketIOServer, playerElo: number) => {
    // First check if this player is already in the waiting list
    const existingPlayerIndex = waitingPlayers.findIndex(player => player.socket.id === socket.id);
    if (existingPlayerIndex !== -1) {
        io.to(socket.id).emit('alreadyWaiting');
        console.log("Player already in waiting list", socket.id);
        return;
    }

    // Add the new player to waiting list
    waitingPlayers.push({ socket, elo: playerElo });
    io.to(socket.id).emit('waitingForOpponent');
    console.log("Player added to waiting list", socket.id);

    // Immediately try to find a match
    checkWaitingPlayersForMatches(io);
}

export const checkWaitingPlayersForMatches = (io: SocketIOServer) => {
    if (waitingPlayers.length < 2) return;

    for (let i = 0; i < waitingPlayers.length; i++) {
        const player = waitingPlayers[i];
        
        for (let j = i + 1; j < waitingPlayers.length; j++) {
            const opponent = waitingPlayers[j];
            
            if (Math.abs(player.elo - opponent.elo) <= 1000) {
                
                // Remove both players from waiting list 
                waitingPlayers.splice(j, 1);
                waitingPlayers.splice(i, 1);
                
                const gameSession = createNewGameSession(player.socket, opponent.socket);
                const gameId = gameSession.gameId;

                player.socket.join(gameId);
                opponent.socket.join(gameId);

                io.to(gameId).emit('gameStart', { gameId: gameId, initialGameState: gameSessions[gameId].gameState });
                io.to(player.socket.id).emit('gameJoined', { gameId: gameId, playerColor: 'white' });
                io.to(opponent.socket.id).emit('gameJoined', { gameId: gameId, playerColor: 'black' });
                console.log("Successfully matched players", player.socket.id, "and", opponent.socket.id);
                
                i--;
                break;
            }
        }
    }
}

export const handleDisconnect = (socket: Socket, reason: string) => {
    const index = waitingPlayers.findIndex(player => player.socket.id === socket.id);
    if (index > -1) {
        waitingPlayers.splice(index, 1);
        console.log(`Player removed from waiting list. Reason: ${reason}`);
    }
    
    for (const gameId in gameSessions) {
        const session = gameSessions[gameId];
        const playerIndex = session.playerSockets.findIndex(s => s.id === socket.id);
        
        if (playerIndex > -1) {
            const otherPlayerIndex = playerIndex === 0 ? 1 : 0;
            if (session.playerSockets[otherPlayerIndex]) {
                session.playerSockets[otherPlayerIndex].emit('opponentDisconnected', { gameId });
            }
            
            // Remove the game session
            delete gameSessions[gameId];
            console.log(`Game session ${gameId} ended due to player disconnect`);
            break;
        }
    }
}
