import { Socket, Server as SocketIOServer } from 'socket.io';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { GameSession, IGameSession } from '../models/GameSession';
import { PlayMode, GameResult, GameStatus } from '../types/enum';
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
export const saveMove = async (gameId: string, move: string, moveNumber: number) => {
    await GameSession.updateOne(
        { gameId },
        { $push: { moves: { moveNumber, move } } }
    )
}

// Update game ressult
export const saveGameResult = async (prisma: PrismaClient, gameId: string, chess: Chess) => {
    let result: GameResult = GameResult.inProgress;

    // Check the game ressult
    if (chess.isGameOver()) {
        if (chess.isCheckmate()) {
            result = chess.turn() === "b" ? GameResult.whiteWins : GameResult.blackWins;
        } else if (chess.isStalemate() || chess.isDraw()) {
            result = GameResult.draw;
        }
    }

    // Update game result in mongo database
    await GameSession.updateOne(
        { gameId },
        {
            $set: {
                finalFen: chess.fen(),
                endTime: new Date(),
                result,
                status: GameStatus.finished
            }
        }
    );

    // Update game result in neon db
    await prisma.games.update({
        where: { id: gameId },
        data: { status: 'completed' }
    });
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
