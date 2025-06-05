import { Socket, Server as SocketIOServer } from 'socket.io';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { GameSession, IGameSession } from '../models/GameSession';
import { PlayMode, GameResult, GameStatus } from '../types/enum';
import validator from 'validator';
import { stockfishService } from './stockfish.service';
import { User } from '../models';
interface GameSession {
    gameId: string;
    playerSockets: Socket[];
    gameState: string;
    chess: Chess;
}

interface WaitingPlayer {
    socket: Socket;
    elo: number;
}

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
export const saveMove = async (
    gameId: string, 
    move: string, 
    moveNumber: number,
    fen: string  // Add FEN parameter
) => {
    await GameSession.updateOne(
        { gameId },
        { 
            $push: { 
                moves: { 
                    moveNumber, 
                    move, 
                    fen,  // Include FEN in the move object
                    evaluation: 0,
                    bestmove: '',
                    mate: null,
                    continuation: []
                } 
            } 
        }
    )
}

// Update game ressult
export const saveGameResult = async (gameId: string, resultString: string) => {
    let result: GameResult = GameResult.inProgress;

    // Parse the result string to determine the game result
    if (resultString.includes('White wins by checkmate') || resultString.includes('White wins by time') || resultString.includes('White wins by disconnect')) {
        result = GameResult.whiteWins;
    } else if (resultString.includes('Black wins by checkmate') || resultString.includes('Black wins by time') || resultString.includes('Black wins by disconnect')) {
        result = GameResult.blackWins;
    } else if (resultString.includes('Draw')) {
        result = GameResult.draw;
    }

    console.log(`Saving game result for ${gameId}: ${resultString} (${result})`);

    // Update game result in MongoDB database
    await GameSession.updateOne(
        { gameId },
        {
            $set: {
                endTime: new Date(),
                result,
                status: GameStatus.finished
            }
        }
    );
}

// Find Match function
export const findMatch = async (
    prisma: PrismaClient,
    userId: string,
    playMode: PlayMode,
    colorChoice: 'white' | 'black' | 'random'
) => {
    // First verify that the user exists
    const user = await prisma.users.findUnique({
        where: { id: userId }
    });

    if (!user) {
        throw new Error(`User with ID ${userId} not found`);
    }

    // Define user's chosen mode
    const timeLimit = playMode === PlayMode.bullet ? 1 : playMode === PlayMode.blitz ? 3 : 10;

    const eloRange = 1000;
    const minElo = user.elo - eloRange;
    const maxElo = user.elo + eloRange;

    // Try to find a match where the user's color preference can be satisfied
    let match;

    // First, look for ANY waiting game that matches the criteria regardless of color preference
    // This ensures players get matched faster
    match = await GameSession.findOne({
        status: 'waiting',
        playMode,
        timeLimit: timeLimit * 60 * 1000,
        $or: [
            { whitePlayerId: null, blackPlayerId: { $ne: userId } },
            { whitePlayerId: { $ne: userId }, blackPlayerId: null }
        ]
    });

    // If a match is found, assign the player to the appropriate position
    if (match) {
        // If white position is open and either player wants random or white
        if (!match.whitePlayerId && (colorChoice === 'random' || colorChoice === 'white')) {
            await GameSession.updateOne(
                { gameId: match.gameId },
                {
                    $set: {
                        whitePlayerId: userId,
                        whitePlayerElo: user.elo,
                        status: 'active'
                    }
                }
            );
            return match.gameId;
        }
        // If black position is open and either player wants random or black
        else if (!match.blackPlayerId && (colorChoice === 'random' || colorChoice === 'black')) {
            await GameSession.updateOne(
                { gameId: match.gameId },
                {
                    $set: {
                        blackPlayerId: userId,
                        blackPlayerElo: user.elo,
                        status: 'active'
                    }
                }
            );
            return match.gameId;
        }
    }

    // If no match found or color preference couldn't be satisfied, try to find a match
    // that specifically matches the player's color preference
    if (colorChoice === 'white') {
        match = await GameSession.findOne({
            status: 'waiting',
            playMode,
            timeLimit: timeLimit * 60 * 1000,
            whitePlayerId: null,
            blackPlayerId: { $ne: userId },
            'blackPlayerElo': { $gte: minElo, $lte: maxElo }
        });
        if (match) {
            await GameSession.updateOne(
                { gameId: match.gameId },
                {
                    $set: {
                        whitePlayerId: userId,
                        whitePlayerElo: user.elo,
                        status: 'active'
                    }
                }
            );
            return match.gameId;
        }
    } else if (colorChoice === 'black') {
        match = await GameSession.findOne({
            status: 'waiting',
            playMode,
            timeLimit: timeLimit * 60 * 1000,
            whitePlayerId: { $ne: userId },
            blackPlayerId: null,
            'whitePlayerElo': { $gte: minElo, $lte: maxElo }
        });
        if (match) {
            await GameSession.updateOne(
                { gameId: match.gameId },
                {
                    $set: {
                        blackPlayerId: userId,
                        blackPlayerElo: user.elo,
                        status: 'active'
                    }
                }
            );
            return match.gameId;
        }
    } else {
        match = await GameSession.findOne({
            status: 'waiting',
            playMode,
            timeLimit: timeLimit * 60 * 1000,
            $or: [
                {
                    whitePlayerId: null,
                    blackPlayerId: { $ne: userId },
                    'blackPlayerElo': { $gte: minElo, $lte: maxElo }
                },
                {
                    whitePlayerId: { $ne: userId },
                    blackPlayerId: null,
                    'whitePlayerElo': { $gte: minElo, $lte: maxElo }
                }
            ]
        });
        if (match) {
            if (!match.whitePlayerId) {
                await GameSession.updateOne(
                    { gameId: match.gameId },
                    {
                        $set: {
                            whitePlayerId: userId,
                            whitePlayerElo: user.elo,
                            status: 'active'
                        }
                    }
                );
            } else {
                await GameSession.updateOne(
                    { gameId: match.gameId },
                    {
                        $set: {
                            blackPlayerId: userId,
                            blackPlayerElo: user.elo,
                            status: 'active'
                        }
                    }
                );
            }
            return match.gameId;
        }
    }

    // No match found, create a new game with the user's color preference
    const game = await prisma.games.create({
        data: {
            id: uuidv4(), // Add unique ID
            userId: userId,
            status: 'active' // Add default status
        }
    });

    let whitePlayerId: string | null = null;
    let blackPlayerId: string | null = null;
    let whitePlayerElo: number | null = null;
    let blackPlayerElo: number | null = null;

    if (colorChoice === 'white') {
        whitePlayerId = userId;
        whitePlayerElo = user.elo;
    } else if (colorChoice === 'black') {
        blackPlayerId = userId;
        blackPlayerElo = user.elo;
    } else {
        if (Math.random() > 0.5) {
            whitePlayerId = userId;
            whitePlayerElo = user.elo;
        } else {
            blackPlayerId = userId;
            blackPlayerElo = user.elo;
        }
    }

    await GameSession.create({
        gameId: game.id,
        whitePlayerId,
        blackPlayerId,
        whitePlayerElo,
        blackPlayerElo,
        startTime: new Date(),
        endTime: null,
        result: GameResult.inProgress,
        status: GameStatus.waiting,
        playMode,
        timeLimit: timeLimit * 60 * 1000,
        moves: []
    });

    return game.id;
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

const gameSessions: { [gameId: string]: GameSession } = {};
const waitingPlayers: WaitingPlayer[] = [];

const generateGameId = (): string => {
    return Math.random().toString(36).substring(2, 15);
}

export const createNewGameSession = (socket1: Socket, socket2: Socket): GameSession => {
    const gameId = generateGameId()
    const chess = new Chess()
    const newGame: GameSession = {
        gameId: gameId,
        playerSockets: [socket1, socket2],
        gameState: chess.fen(),
        chess: chess
    }
    gameSessions[gameId] = newGame
    return newGame
}

export const handleMove = (socket: Socket, io: SocketIOServer, gameId: string, move: string) => {
    const session = gameSessions[gameId];
    if (!session) {
        socket.emit('error', { message: 'Game session not found' });
        return;
    }

    try {
        const moveResult = session.chess.move(move);
        session.gameState = session.chess.fen();

        // Save the move to MongoDB with the current FEN
        const moveNumber = session.chess.history().length;
        saveMoveWithAnalysis(gameId, move, moveNumber, session.gameState)
            .catch(error => console.error('Failed to save move:', error));

        io.to(gameId).emit('moveMade', {
            fen: session.gameState,
            move: move
        });

        if (session.chess.isGameOver()) {
            let result = {
                status: 'gameOver',
                reason: '',
                winner: '',
                winnerId: ''
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

export const saveMoveWithAnalysis = async (
    gameId: string,
    move: string,
    moveNumber: number,
    fen: string
) => {
    try {
        // First save basic move data
        await GameSession.updateOne(
            { gameId },
            { 
                $push: { 
                    moves: {
                        moveNumber,
                        move,
                        fen,
                        evaluation: 0, // Placeholder
                        bestmove: '', // Placeholder
                        mate: null,
                        continuation: ''
                    }
                } 
            }
        );

        // Get analysis from Stockfish
        const analysis = await stockfishService.analyzeMove(fen, move, moveNumber);
        
        // Update the move with analysis
        await GameSession.updateOne(
            { gameId, 'moves.moveNumber': moveNumber },
            { 
                $set: {
                    'moves.$.evaluation': analysis.evaluation,
                    'moves.$.bestmove': analysis.bestmove,
                    'moves.$.mate': analysis.mate,
                    'moves.$.continuation': analysis.continuation
                }
            }
        );

        return analysis;

    } catch (error) {
        console.error('Analysis failed:', error);
        return null;
    }
};

// Comprehensive post-game analysis
export const analyzeCompleteGame = async (gameId: string): Promise<void> => {
    try {
        const gameSession = await GameSession.findOne({ gameId });
        if (!gameSession || !gameSession.moves || gameSession.moves.length === 0) {
            throw new Error('Game session or moves not found');
        }

        if (gameSession.analysisCompleted) {
            console.log(`Game ${gameId} already analyzed`);
            return;
        }

        console.log(`Starting comprehensive analysis for game ${gameId}`);

        // Analyze each move with higher depth
        for (let i = 0; i < gameSession.moves.length; i++) {
            const move = gameSession.moves[i];
            console.log(move);
            try {
                if (move.fen) {
                    const analysis = await stockfishService.analyzePosition(move.fen, 15); // Higher depth
                    console.log(analysis);
                    // Update move with deeper analysis
                    await GameSession.updateOne(
                        { gameId, 'moves.moveNumber': move.moveNumber },
                        { 
                            $set: {
                                'moves.$.evaluation': analysis.evaluation,
                                'moves.$.bestmove': analysis.bestmove,
                                'moves.$.mate': analysis.mate,
                                'moves.$.continuation': analysis.continuation
                            }
                        }
                    );
                }
                
                // Small delay between analyses
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (error) {
                console.error(`Failed to analyze move ${i + 1}:`, error);
                continue; // Skip failed analysis and continue
            }
        }

        // Mark analysis as completed
        await GameSession.updateOne(
            { gameId },
            { 
                $set: {
                    analysisCompleted: true,
                    analysisDate: new Date()
                }
            }
        );

        console.log(`Comprehensive analysis completed for game ${gameId}`);

    } catch (error) {
        console.error(`Failed to complete analysis for game ${gameId}:`, error);
    }
};

// Get game analysis data
export const getGameAnalysis = async (gameId: string) => {
    try {
        const gameSession = await GameSession.findOne({ gameId }).lean();
        if (!gameSession) {
            throw new Error('Game not found');
        }

        // Calculate basic statistics
        const moves = gameSession.moves || [];
        const whiteMoves = moves.filter((_, index) => index % 2 === 0);
        const blackMoves = moves.filter((_, index) => index % 2 === 1);

        const calculateStats = (playerMoves: any[]) => {
            const totalMoves = playerMoves.length;
            const avgEvaluation = totalMoves > 0 
                ? playerMoves.reduce((sum, move) => sum + Math.abs(move.evaluation || 0), 0) / totalMoves 
                : 0;
            
            return {
                totalMoves,
                averageEvaluation: Math.round(avgEvaluation),
                bestMoves: playerMoves.filter(m => m.bestmove && m.bestmove !== 'analysis_failed').length
            };
        };

        return {
            gameId,
            whitePlayerId: gameSession.whitePlayerId,
            blackPlayerId: gameSession.blackPlayerId,
            result: gameSession.result,
            playMode: gameSession.playMode,
            moves: moves,
            analysisCompleted: gameSession.analysisCompleted || false,
            analysisDate: gameSession.analysisDate,
            statistics: {
                white: calculateStats(whiteMoves),
                black: calculateStats(blackMoves),
                totalMoves: moves.length
            }
        };

    } catch (error) {
        console.error('Error retrieving game analysis:', error);
        throw error;
    }
};

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

export interface RetrieveOptions {
    limit?: number;
    skip?: number;
    status?: string;
    playMode?: string;
}

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export interface GameHistoryItem {
    opponentName: string | null;
    gameMode: string;
    totalTime: number;
    result: 'Victory' | 'Defeat' | 'Draw';
}

/**
 * Fetch game history.
 */
export async function retrieveGameSessions(
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