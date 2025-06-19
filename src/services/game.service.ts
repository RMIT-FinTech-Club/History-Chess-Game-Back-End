import { Socket, Server as SocketIOServer } from 'socket.io';
import { Chess, Move } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { GameSession, IGameSession, IMove } from '../models/GameSession';
import { PlayMode, GameResult, GameStatus } from '../types/enum';
import validator from 'validator';
import { stockfishService } from './stockfish.service';
import { User } from '../models';
import { GameHistoryItem, InMemoryGameSession, QueuedPlayer, WaitingPlayer } from '../types/game.types';
import { CustomSocket } from '../types/socket.types';
import { gameSessions } from './socket.service';

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


export const saveMove = async (
    gameId: string,
    move: string,
    moveNumber: number,
    playerColor: 'w' | 'b',
    fen: string,
    playerId: string
): Promise<IMove | null> => {
    try {
        //console.log(`Starting analysis for move ${moveNumber}: ${move}`);
        //console.log(gameId, move, moveNumber, playerColor, fen, playerId);
        // First save basic move data with required fields
        await GameSession.updateOne(
            { gameId },
            {
                $push: {
                    moves: {
                        moveNumber: moveNumber,
                        move: move,
                        fen: fen,
                        evaluation: 0,
                        bestmove: '',
                        mate: null,
                        continuation: '',
                        playerColor: playerColor,
                        playerId,
                        initialEvalCP: 0, // Placeholder
                        moveEvalCP: 0, // Placeholder
                        initialExpectedPoints: 0, // Placeholder
                        moveExpectedPoints: 0, // Placeholder
                        bestMoveExpectedPoints: 0, // Placeholder
                        expectedPointsLost: 0, // Placeholder
                        classification: 'Analyzing...',
                        error: undefined
                    }
                }
            }
        );

        //console.log(`Move ${moveNumber} saved to database, starting Stockfish analysis...`);

        // Get analysis from Stockfish
        // const session = gameSessions[gameId];
        //console.log(gameSessions);
        const session = gameSessions.get(gameId);
        if (!session || !session.chess) {
            // console.error(`[saveMove] Game session or chess.js instance not found for gameId: ${gameId}`);
            throw new Error('Game session not found for analysis.');
        }

        const fullHistory: Move[] = session.chess.history({ verbose: true });
        const currentMoveDetails: Move | undefined = fullHistory[moveNumber - 1];
        if (!currentMoveDetails) {
            console.error(`[saveMove] Critical Error: Could not find chess.js Move object at expected index ${moveNumber - 1} for move "${move}" (move #${moveNumber}). Full history length: ${fullHistory.length}.`);
            throw new Error(`Could not locate chess.js Move object for move "${move}" (move #${moveNumber}). Analysis aborted.`);
        }

        const tempChessBeforeMove = new Chess();
        for (let i = 0; i < moveNumber - 1; i++) { // Apply all moves *before* the current one
            const historicalMove = fullHistory[i];
            if (historicalMove) {
                tempChessBeforeMove.move(historicalMove);
            } else {
                throw new Error(`Corrupted game history detected for game ${gameId} at move index ${i}. Analysis aborted.`);
            }
        }
        const fenBeforeMove = tempChessBeforeMove.fen();


        const analysis: IMove = await stockfishService.analyzeAndClassifyMove(
            fenBeforeMove,
            currentMoveDetails, // This is now correctly the `Move` object
            moveNumber
        );
        // console.log(`Stockfish analysis result:`, analysis);

        // Update the move with analysis
        const updateResult = await GameSession.updateOne(
            { gameId, 'moves.moveNumber': moveNumber },
            {
                $set: {
                    'moves.$.move': analysis.move,
                    'moves.$.fen': analysis.fen,
                    'moves.$.evaluation': analysis.evaluation,
                    'moves.$.bestmove': analysis.bestmove,
                    'moves.$.mate': analysis.mate,
                    'moves.$.continuation': analysis.continuation,
                    'moves.$.playerColor': analysis.playerColor,
                    'moves.$.initialEvalCP': analysis.initialEvalCP,
                    'moves.$.moveEvalCP': analysis.moveEvalCP,
                    'moves.$.initialExpectedPoints': analysis.initialExpectedPoints,
                    'moves.$.moveExpectedPoints': analysis.moveExpectedPoints,
                    'moves.$.bestMoveExpectedPoints': analysis.bestMoveExpectedPoints,
                    'moves.$.expectedPointsLost': analysis.expectedPointsLost,
                    'moves.$.classification': analysis.classification,
                    'moves.$.error': analysis.error || null,
                }
            }
        );

        // console.log(`Move ${moveNumber} analysis update result:`, updateResult);

        if (updateResult.modifiedCount === 0) {
            console.warn(`No move was updated for gameId: ${gameId}, moveNumber: ${moveNumber}`);
        }

        return analysis;

    } catch (error) {
        console.error(`Analysis failed for move ${moveNumber}:`, error);

        // Update move with error indicator
        try {
            await GameSession.updateOne(
                { gameId, 'moves.moveNumber': moveNumber },
                {
                    $set: {
                        'moves.$.evaluation': 0,
                        'moves.$.bestmove': 'analysis_failed',
                        'moves.$.mate': null,
                        'moves.$.continuation': 'Error: Analysis failed'
                    }
                }
            );
        } catch (updateError) {
            console.error('Failed to update move with error status:', updateError);
        }

        return null;
    }
};



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

    // console.log(`Saving game result for ${gameId}: ${resultString} (${result}). Winner: ${winner || 'Draw'}`);

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

export const calculateGameAccuracy = async (gameId: string): Promise<void> => {
    const gameSession = await GameSession.findOne({ gameId: gameId });

    if (!gameSession || !gameSession.moves) {
        throw new Error('Game not found or has no moves');
    }

    // Then filter the moves array into white and black moves
    const whiteMoves = gameSession.moves.filter(move => move.playerColor === 'w');
    console.log(`White moves for game ${gameId}:`, whiteMoves);
    const blackMoves = gameSession.moves.filter(move => move.playerColor === 'b');

    const whiteAccuracy = await stockfishService.calculateGameAccuracy(whiteMoves);
    console.log(`White accuracy for game ${gameId}:`, whiteAccuracy);
    if (!whiteAccuracy) {
        throw new Error('Failed to calculate white accuracy');
    }

    const blackAccuracy = await stockfishService.calculateGameAccuracy(blackMoves);
    if (!blackAccuracy) {
        throw new Error('Failed to calculate black accuracy');
    }
    await GameSession.updateOne(
        { gameId },
        {
            $set: {
                whiteAccuracyPoint: whiteAccuracy,
                blackAccuracyPoint: blackAccuracy,
            }
        }
    );

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
        gameState: chess.fen(),
    };
    // gameSessions[gameId] = newGame;
    gameSessions.set(gameId, newGame);
    //console.log(gameSessions)
    return newGame;
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
        //console.log(`Player removed from waiting list. Reason: ${reason}`);
    }

    for (const gameId in gameSessions) {
        const session = gameSessions.get(gameId);
        //console.log(session);
        if (!session) continue;
        const playerIndex = session.playerSockets.findIndex(s => s.id === socket.id);

        if (playerIndex > -1) {
            const otherPlayerIndex = playerIndex === 0 ? 1 : 0;
            if (session.playerSockets[otherPlayerIndex]) {
                session.playerSockets[otherPlayerIndex].emit('opponentDisconnected', { gameId });
            }

            // Remove the game session
            // delete gameSessions[gameId];
            gameSessions.delete(gameId);
            //console.log(`Game session ${gameId} ended due to player disconnect`);
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


/**
 * Retrieve game history for a specific user without loading moves
 */
const prisma = new PrismaClient();

export const getUserNameById = async (userId: string): Promise<string | null> => {
    try {
        const user = await prisma.users.findUnique({
            where: { id: userId },
            select: { username: true },
        });
        return user ? user.username : null;
    } catch (error) {
        console.error(`Error fetching user name for ID ${userId}:`, error);
        return null;
    }
};



export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}


/**
 * Fetch game history.
 */
export async function getGameHistories(
    userId: string,
    limit = 10,
    skip = 0
): Promise<GameHistoryItem[]> {
    // ----- 1) Validate parameters -----
    if (!validator.isUUID(userId, 4)) {
        throw new ValidationError('Invalid userId: must be a valid UUID v4');
    }
    if (!validator.isInt(String(limit), { min: 1, max: 1000 })) {
        throw new ValidationError('Invalid limit: must be an integer between 1 and 1000');
    }
    if (!validator.isInt(String(skip), { min: 0 })) {
        throw new ValidationError('Invalid skip: must be a non‑negative integer');
    }

    try {
        // ----- 2) Fetch data -----
        const sessions = await GameSession.find({
            $or: [{ whitePlayerId: userId }, { blackPlayerId: userId }]
        })
            .select('whitePlayerId blackPlayerId startTime endTime result playMode')
            .sort({ startTime: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        if (sessions.length === 0) {
            return [];
        }

        // ----- 3) Batch opponent ID → name lookup -----
        const opponentIds = Array.from(new Set(
            sessions
                .map(s => (s.whitePlayerId === userId ? s.blackPlayerId : s.whitePlayerId))
                .filter((id): id is string => Boolean(id))
        ));

        const users = await prisma.users.findMany({
            where: { id: { in: opponentIds } },
            select: { id: true, username: true }
        });
        const nameById = new Map<string, string>(users.map((u: { id: any; username: any; }) => [u.id, u.username]));

        // ----- 4) Map to the slim DTO -----
        return sessions.map(s => {
            const iAmWhite = s.whitePlayerId === userId;
            const oppId = iAmWhite ? s.blackPlayerId : s.whitePlayerId;
            const oppName = oppId ? (nameById.get(oppId) || null) : null;

            // compute total seconds
            const startMs = new Date(s.startTime!).getTime();
            const endMs = new Date(s.endTime!).getTime();
            const totalSec = Math.floor((endMs - startMs) / 1000);

            // derive result from stored session.result
            let result: GameHistoryItem['result'];
            if (s.result === '1/2-1/2') {
                result = 'Draw';
            } else if (
                (iAmWhite && s.result === '1-0') ||
                (!iAmWhite && s.result === '0-1')
            ) {
                result = 'Victory';
            } else {
                result = 'Defeat';
            }

            return {
                opponentName: oppName,
                gameMode: s.playMode,
                totalTime: totalSec,
                result
            };
        });
    } catch (err: any) {
        // Log the full error for debugging
        console.error(`Failed to fetch game history for ${userId}`, err);
        // Convert any non-ValidationError into a generic service error
        if (err instanceof ValidationError) {
            throw err;
        }
        throw new Error('Internal server error while retrieving game history');
    }
}

// Get game analysis data
export const getGameAnalysis = async (gameId: string) => {
    try {
        const gameSession = await GameSession.findOne({ gameId }).lean();
        if (!gameSession) {
            throw new Error('Game not found');
        }

        if (!gameSession.moves || gameSession.moves.length === 0) {
            throw new Error('No moves found for this game');
        }

        return {

        };

    } catch (error) {
        console.error('Error retrieving game analysis:', error);
        throw error;
    }
};

/**
 * Retrieve moves for a specific game when user clicks on a game in history
 */
export const retrieveGameMoves = async (gameId: string) => {
    if (!validator.isUUID(gameId, 4)) {
        throw new ValidationError('Invalid gameId: must be a valid UUID v4');
    }

    try {
        const game = await GameSession.findOne({ gameId });
        if (!game) {
            throw new Error(`Game with ID ${gameId} not found`);
        }

        return {
            gameId: game.gameId,
            moves: game.moves,
        };
    } catch (err: any) {
        if (err instanceof ValidationError) throw err;
        console.error(`Error retrieving moves for game ${gameId}:`, err);
        throw new Error('Failed to retrieve game moves. Please try again later.');
    }
};