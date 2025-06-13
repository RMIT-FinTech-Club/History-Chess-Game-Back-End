import { Socket, Server as SocketIOServer } from 'socket.io';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { GameSession, IGameSession } from '../models/GameSession';
import { PlayMode, GameResult, GameStatus } from '../types/enum';
import { InMemoryGameSession, WaitingPlayer } from '../types/game.types';
import {CustomSocket} from '../types/socket.types';

export const createGame = async (
    prisma: PrismaClient,
    userId: string,
    playMode: PlayMode,
    colorPreference: 'white' | 'black' | 'random' = 'random',
    opponentId?: string
): Promise<string> => {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
        throw new Error(`User with ID ${userId} not found`);
    }
    // User chosen mode
    const timeLimit = playMode === PlayMode.bullet ? 1 : playMode === PlayMode.blitz ? 3 : 10;
    // User choosen Black or White side
    const whitePlayerId = colorPreference === 'white' || (colorPreference === 'random' && Math.random() > 0.5) ? userId : opponentId;
    const blackPlayerId = whitePlayerId === userId ? opponentId : userId;

    // Create a new game in NeonDB
    const game = await prisma.games.create({
        data: {
            id: uuidv4(),
            userId: userId
        }
    })

    // Create GameSession in MongoDB
    await GameSession.create({
        gameId: game.id,
        whitePlayerId: whitePlayerId || null,
        blackPlayerId: blackPlayerId || null,
        startTime: new Date(),
        endTime: null,
        result: '*',
        status: opponentId ? 'pending' : 'waiting', // Pending if opponent player is ready, waiting if no opponent player and wait for other to join
        playMode: playMode,
        timeLimit: timeLimit * 60 * 1000,
        moves: [],
        challengedOpponentId: opponentId || null
    });

    return game.id;
}

// Update move from player
export const saveMove = async (gameId: string, move: string, moveNumber: number, color: 'white' | 'black', playerId: string) => {
    await GameSession.updateOne(
        { gameId },
        { 
            $push: { 
                moves: { 
                    moveNumber, 
                    move,
                    color,
                    playerId 
                } 
            } 
        }
    )
}

// Update game ressult
export const saveGameResult = async (gameId: string, resultString: string) => {
    let result: GameResult = GameResult.inProgress;
    let winner: string | null = null;

    // Parse the result string to determine the game result and winner
    if (resultString.includes('White wins')) {
        result = GameResult.whiteWins;
        const game = await GameSession.findOne({ gameId });
        winner = game?.whitePlayerId || null;
    } else if (resultString.includes('Black wins')) {
        result = GameResult.blackWins;
        const game = await GameSession.findOne({ gameId });
        winner = game?.blackPlayerId || null;
    } else if (resultString.includes('Draw')) {
        result = GameResult.draw;
        winner = null;
    }

    console.log(`Saving game result for ${gameId}: ${resultString} (${result}). Winner: ${winner || 'Draw'}`);

    // Update game result in MongoDB database
    await GameSession.updateOne(
        { gameId },
        {
            $set: {
                endTime: new Date(),
                result,
                winner,
                status: GameStatus.finished
            }
        }
    );
}

interface QueuedPlayer {
    userId: string;
    socketId: string;
    playMode: PlayMode;
    colorChoice: 'white' | 'black' | 'random';
    elo: number;
    timestamp: number;
}

// In-memory matchmaking queue
const matchmakingQueue: QueuedPlayer[] = [];

// Find Match function
export const findMatch = async (
    prisma: PrismaClient,
    userId: string,
    playMode: PlayMode,
    colorChoice: 'white' | 'black' | 'random',
    socketId: string
) => {
    // First verify that the user exists
    const user = await prisma.users.findUnique({
        where: { id: userId }
    });

    if (!user) {
        throw new Error(`User with ID ${userId} not found`);
    }

    const eloRange = 1000;
    const minElo = user.elo - eloRange;
    const maxElo = user.elo + eloRange;

    const queuedPlayer: QueuedPlayer = {
        userId,
        socketId,
        playMode,
        colorChoice,
        elo: user.elo,
        timestamp: Date.now()
    };

    // Check if player is already in queue
    const existingIndex = matchmakingQueue.findIndex(p => p.userId === userId);
    if (existingIndex !== -1) {
        matchmakingQueue[existingIndex] = queuedPlayer;
    } else {
        matchmakingQueue.push(queuedPlayer);
    }

    // Try to find a match
    const matchIndex = matchmakingQueue.findIndex((player, index) => {
        if (player.userId === userId) return false; // Don't match with self
        
        // Check play mode
        if (player.playMode !== playMode) return false;
        
        // Check ELO range
        if (player.elo < minElo || player.elo > maxElo) return false;
        
        // Check color compatibility
        if (colorChoice === 'white' && player.colorChoice === 'white') return false;
        if (colorChoice === 'black' && player.colorChoice === 'black') return false;
        
        return true;
    });

    if (matchIndex !== -1) {
        const matchedPlayer = matchmakingQueue[matchIndex];
        // Remove both players from queue
        matchmakingQueue.splice(matchIndex, 1);
        const currentPlayerIndex = matchmakingQueue.findIndex(p => p.userId === userId);
        if (currentPlayerIndex !== -1) {
            matchmakingQueue.splice(currentPlayerIndex, 1);
        }

        // Create game session for matched players
        const game = await prisma.games.create({
            data: {
                id: uuidv4(),
                userId: userId,
                status: 'active'
            }
        });

        // Determine player colors
        let whitePlayerId: string;
        let blackPlayerId: string;
        let whitePlayerElo: number;
        let blackPlayerElo: number;

        if (colorChoice === 'white' || (colorChoice === 'random' && matchedPlayer.colorChoice !== 'white')) {
            whitePlayerId = userId;
            blackPlayerId = matchedPlayer.userId;
            whitePlayerElo = user.elo;
            blackPlayerElo = matchedPlayer.elo;
        } else {
            whitePlayerId = matchedPlayer.userId;
            blackPlayerId = userId;
            whitePlayerElo = matchedPlayer.elo;
            blackPlayerElo = user.elo;
        }

        // Create game session
        await GameSession.create({
            gameId: game.id,
            whitePlayerId,
            blackPlayerId,
            whitePlayerElo,
            blackPlayerElo,
            startTime: new Date(),
            endTime: null,
            result: GameResult.inProgress,
            status: GameStatus.active,
            playMode,
            timeLimit: (playMode === PlayMode.bullet ? 1 : playMode === PlayMode.blitz ? 3 : 10) * 60 * 1000,
            moves: []
        });

        return {
            gameId: game.id,
            matchedPlayer: {
                userId: matchedPlayer.userId,
                socketId: matchedPlayer.socketId
            }
        };
    }

    // No match found, player remains in queue
    return null;
}

// Remove player from matchmaking queue
export const removeFromMatchmaking = (userId: string) => {
    const index = matchmakingQueue.findIndex(p => p.userId === userId);
    if (index !== -1) {
        matchmakingQueue.splice(index, 1);
    }
}

export const updateElo = async (prisma: PrismaClient, gameId: string, winnerId: string | null) => {
    const game: IGameSession | null = await GameSession.findOne({ gameId: gameId })

    if (!game || !game.whitePlayerId || !game.blackPlayerId) return;

    const [whiteUser, blackUser] = await Promise.all([
        prisma.users.findUnique({ where: { id: game.whitePlayerId } }),
        prisma.users.findUnique({ where: { id: game.blackPlayerId } }),
    ])

    if (whiteUser && blackUser) {
        const Ra = whiteUser.elo;
        const Rb = blackUser.elo;
        const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
        const Eb = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));
        const K = 32;

        let whiteScore, blackScore;
        if (winnerId === whiteUser.id) {
            whiteScore = 1;
            blackScore = 0;
        } else if (winnerId === blackUser.id) {
            whiteScore = 0;
            blackScore = 1;
        } else {
            whiteScore = blackScore = 0.5; // Draw or disconnect
        }

        const newWhiteElo = Math.round(Ra + K * (whiteScore - Ea));
        const newBlackElo = Math.round(Rb + K * (blackScore - Eb));

        await prisma.$transaction([
            prisma.users.update({ where: { id: whiteUser.id }, data: { elo: newWhiteElo } }),
            prisma.users.update({ where: { id: blackUser.id }, data: { elo: newBlackElo } })
        ]);

        return { whiteElo: newWhiteElo, blackElo: newBlackElo };
    } else {
        return;
    }
}

const gameSessions: { [gameId: string]: InMemoryGameSession } = {};
const waitingPlayers: WaitingPlayer[] = [];

const generateGameId = (): string => {
    return Math.random().toString(36).substring(2, 15);
}

export const createNewGameSession = (socket1: Socket, socket2: Socket): InMemoryGameSession => {
    const gameId = generateGameId();
    const chess = new Chess();
    const newGame: InMemoryGameSession = {
        gameId: gameId,
        players: [],
        playerSockets: [socket1, socket2],
        chess: chess,
        status: GameStatus.waiting,
        whiteTimeLeft: 0,
        blackTimeLeft: 0,
        gameState: chess.fen()
    };
    gameSessions[gameId] = newGame;
    return newGame;
}

export const handleMove = (socket: Socket, io: SocketIOServer, gameId: string, move: string) => {
    const session = gameSessions[gameId];
    if (!session) {
        socket.emit('error', { message: 'Game session not found' });
        return;
    }

    try {
        session.chess.move(move);
        session.gameState = session.chess.fen();


        io.to(gameId).emit('moveMade',{
            fen: session.gameState,
            move: move
        })

        if (session.chess.isGameOver()) {
            let result = {
                status: 'gameOver',
                reason: '',
                winner: '',
                winnerId:''
            }

            if (session.chess.isCheckmate()) {
                result.reason = 'checkmate';
                result.winner = session.chess.turn() === 'w' ? 'black' : 'white';
                
                // Who join first is white so if the current turn is white, black wins
                // result.winnerId = session.chess.turn() === 'w'? session.playerSockets[1].id : session.playerSockets[0].id;
                // console.log("Winner is: ",  result.winnerId);

            } else if (session.chess.isDraw()) {
                result.reason = 'draw';
                if (session.chess.isStalemate()) {
                    result.reason = 'draw by stalemate';
                    console.log("Stalemate")
                } else if (session.chess.isThreefoldRepetition()) {
                    result.reason = 'draw by repetition';
                    console.log("Repetition")
                } else if (session.chess.isInsufficientMaterial()) {
                    result.reason = 'draw by insufficient material';
                    console.log("insufficient material")
                }
            }

            io.to(gameId).emit('gameOver', result);
            delete gameSessions[gameId];
        }
    }
    catch (error) {
        socket.emit('error', { message: 'Invalid move' });
    }
}



// export const joinGame = (socket: Socket, io: SocketIOServer, playerElo: number) => {
//     // First check if this player is already in the waiting list
//     const existingPlayerIndex = waitingPlayers.findIndex(player => player.socket.id === socket.id);
//     if (existingPlayerIndex !== -1) {
//         io.to(socket.id).emit('alreadyWaiting');
//         console.log("Player already in waiting list", socket.id);
//         return;
//     }

//     // Add the new player to waiting list
//     waitingPlayers.push({ socket, elo: playerElo });
//     io.to(socket.id).emit('waitingForOpponent');
//     console.log("Player added to waiting list", socket.id);

//     // Immediately try to find a match
//     checkWaitingPlayersForMatches(io);
// }

// export const checkWaitingPlayersForMatches = (io: SocketIOServer) => {
//     if (waitingPlayers.length < 2) return;

//     for (let i = 0; i < waitingPlayers.length; i++) {
//         const player = waitingPlayers[i];

//         for (let j = i + 1; j < waitingPlayers.length; j++) {
//             const opponent = waitingPlayers[j];

//             if (Math.abs(player.elo - opponent.elo) <= 1000) {

//                 // Remove both players from waiting list 
//                 waitingPlayers.splice(j, 1);
//                 waitingPlayers.splice(i, 1);

//                 const gameSession = createNewGameSession(player.socket, opponent.socket);
//                 const gameId = gameSession.gameId;

//                 player.socket.join(gameId);
//                 opponent.socket.join(gameId);

//                 io.to(gameId).emit('gameStart', { gameId: gameId, initialGameState: gameSessions[gameId].gameState });
//                 io.to(player.socket.id).emit('gameJoined', { gameId: gameId, playerColor: 'white' });
//                 io.to(opponent.socket.id).emit('gameJoined', { gameId: gameId, playerColor: 'black' });
//                 console.log("Successfully matched players", player.socket.id, "and", opponent.socket.id);

//                 i--;
//                 break;
//             }
//         }
//     }
// }

export const handleDisconnect = (socket: Socket, reason: string): void => {
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

const pendingChallenges: Map<string, { 
    challengerId: string, 
    opponentId: string, 
    playMode: PlayMode, 
    colorPreference: 'white' | 'black' | 'random',
    timer: NodeJS.Timeout,
    challengerSocket: Socket,
    opponentSocket: Socket
}> = new Map();

export const challengeUser = async (
    prisma: PrismaClient,
    io: SocketIOServer,
    challengerSocket: CustomSocket,
    opponentId: string,
    playMode: PlayMode,
    colorPreference: 'white' | 'black' | 'random'
): Promise<{ success: boolean; message: string }> => {

    if (!challengerSocket.data.userId) {
        return { success: false, message: 'Challenger not identified' };
    }

    if (!opponentId) {
        return { success: false, message: 'Opponent not identified' };
    }

    // Check if both users exist
    const [challenger, opponent] = await Promise.all([
        prisma.users.findUnique({ where: { id: challengerSocket.data.userId } }),
        prisma.users.findUnique({ where: { id: opponentId } })
    ]);

    if (!challenger || !opponent) {
        return { success: false, message: 'One or both users not found' };
    }

    // Check if there's already a pending challenge
    if (pendingChallenges.has(opponentId)) {
        return { success: false, message: 'User already has a pending challenge' };
    }

    // Find opponent's socket
    const opponentSocket = Array.from(io.sockets.sockets.values())
        .find(socket => socket.data.userId === opponentId);

    if (!opponentSocket) {
        return { success: false, message: 'Opponent is not online' };
    }

    // Create a new challenge
    const timer = setTimeout(() => {
        const challenge = pendingChallenges.get(opponentId);
        if (challenge) {
            challenge.challengerSocket.emit('challengeExpired', {
                opponentId,
                message: 'Challenge expired'
            });
            pendingChallenges.delete(opponentId);
        }
    }, 30000); // 30 seconds timeout

    pendingChallenges.set(opponentId, {
        challengerId: challengerSocket.data.userId,
        opponentId,
        playMode,
        colorPreference,
        timer,
        challengerSocket,
        opponentSocket
    });

    opponentSocket.emit('gameChallenge', {
        challengerId: challengerSocket.data.userId,
        challengerName: challenger.username,
        playMode,
        colorPreference
    });

    return { success: true, message: 'Challenge sent successfully' };
};

export const respondToChallenge = async (
    prisma: PrismaClient,
    io: SocketIOServer,
    opponentSocket: CustomSocket,
    accept: boolean
): Promise<{ success: boolean; message: string; gameId?: string }> => {
    const challenge = Array.from(pendingChallenges.values())
        .find(c => c.opponentSocket.id === opponentSocket.id);
    
    if (!challenge) {
        return { success: false, message: 'No pending challenge found' };
    }

    clearTimeout(challenge.timer);
    pendingChallenges.delete(challenge.opponentId);

    // Notify challenger of the response
    challenge.challengerSocket.emit('challengeResponse', {
        opponentId: challenge.opponentId,
        accepted: accept
    });

    if (!accept) {
        return { success: false, message: 'Challenge declined' };
    }

    // Create a new game session
    try {
        const gameId = await createGame(
            prisma,
            challenge.challengerId,
            challenge.playMode,
            challenge.colorPreference,
            challenge.opponentId
        );

        // Notify both players that the game is starting
        io.to([challenge.challengerSocket.id, challenge.opponentSocket.id]).emit('gameStarting', {
            gameId,
            playMode: challenge.playMode,
            colorPreference: challenge.colorPreference
        });

        return { 
            success: true, 
            message: 'Challenge accepted', 
            gameId 
        };
    } catch (error) {
        return { 
            success: false, 
            message: 'Failed to create game session' 
        };
    }
};
