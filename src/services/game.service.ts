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
    if (waitingPlayers.length > 0) {
        // Find a player with similar Elo but make sure it's not the same player
        const matchedPlayerIndex = waitingPlayers.findIndex(
            player => Math.abs(player.elo - playerElo) <= 1000 && player.socket.id !== socket.id
        );

        if (matchedPlayerIndex !== -1) {
            const opponent = waitingPlayers.splice(matchedPlayerIndex, 1)[0];
            const gameSession = createNewGameSession(socket, opponent.socket);
            const gameId = gameSession.gameId;

            socket.join(gameId);
            opponent.socket.join(gameId);

            io.to(gameId).emit('gameStart', { gameId: gameId, initialGameState: gameSessions[gameId].gameState });
            io.to(socket.id).emit('gameJoined', { gameId: gameId, playerColor: 'white' });
            io.to(opponent.socket.id).emit('gameJoined', { gameId: gameId, playerColor: 'black' });
            console.log("Successfully Connected between 2 players", socket.id, " ", opponent.socket.id)
        } else {
            // No matching Elo player found, add to waiting list
            // First check if this player is already in the waiting list
            const existingPlayerIndex = waitingPlayers.findIndex(player => player.socket.id === socket.id);
            if (existingPlayerIndex === -1) {
                // Only add if not already in the waiting list
                waitingPlayers.push({ socket, elo: playerElo });
                io.to(socket.id).emit('waitingForOpponent');
                console.log("Player added to waiting list", socket.id);
            } else {
                io.to(socket.id).emit('alreadyWaiting');
                console.log("Player already in waiting list", socket.id);
            }
        }
    } else {
        waitingPlayers.push({ socket, elo: playerElo });
        io.to(socket.id).emit('waitingForOpponent');
        console.log("First player in waiting list", socket.id);
    }
}

export const handleDisconnect = (socket: Socket, reason: string) => {
    // Find the index of the player with the matching socket
    const index = waitingPlayers.findIndex(player => player.socket.id === socket.id);
    if (index > -1) {
        waitingPlayers.splice(index, 1);
        console.log(`Player removed from waiting list. Reason: ${reason}`);
    }
    
    // Check if the player is in any active game session
    for (const gameId in gameSessions) {
        const session = gameSessions[gameId];
        const playerIndex = session.playerSockets.findIndex(s => s.id === socket.id);
        
        if (playerIndex > -1) {
            // Notify the other player that their opponent disconnected
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
