import { Socket, Server as SocketIOServer } from 'socket.io';
import { Chess } from 'chess.js';

interface GameSession {
    gameId: string;
    playerSockets: Socket[];
    gameState: string;
}

const gameSessions: { [gameId: string]: GameSession } = {};
const waitingPlayers: Socket[] = [];

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

export const joinGame = (socket: Socket, io: SocketIOServer) => {
    if (waitingPlayers.length > 0) {
        // Match with waiting player
        const opponentSocket = waitingPlayers.shift();
        if (opponentSocket) {
            const gameSession = createNewGameSession(socket, opponentSocket);
            const gameId = gameSession.gameId;

            socket.join(gameId);
            opponentSocket.join(gameId);

            io.to(gameId).emit('gameStart', { gameId: gameId, initialGameState: gameSessions[gameId].gameState });
            io.to(socket.id).emit('gameJoined', { gameId: gameId, playerColor: 'white' });
            io.to(opponentSocket.id).emit('gameJoined', { gameId: gameId, playerColor: 'black' });
        } else {
            waitingPlayers.push(socket);
            io.to(socket.id).emit('gameJoinError', { message: 'Error finding opponent, please try again.' });
        }
    } else {
        waitingPlayers.push(socket);
        io.to(socket.id).emit('waitingForOpponent');
    }
}

export const handleDisconnect = (socket: Socket, reason: string) => {
    const index = waitingPlayers.indexOf(socket)
    if (index > - 1) {
        waitingPlayers.splice(index, 1);
    }
}