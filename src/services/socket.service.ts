import { Server as SocketIOServer, Socket } from "socket.io"
import { Chess } from "chess.js"
import fastify, { FastifyInstance } from "fastify"
import { GameSession, IGameSession } from "../models/GameSession"
import { GameStatus } from '../types/enum'
import { saveGameResult, saveMove, updateElo } from "./game.service"

interface GameSessionInterface {
    gameId: string;
    players: string[];
    chess: Chess;
    status: GameStatus;
    whiteTimeLeft: number;
    blackTimeLeft: number;
    timer?: NodeJS.Timeout
}

const gameSessions = new Map<string, GameSessionInterface>();

const startTimer = (session: GameSessionInterface, io: SocketIOServer, fastify: FastifyInstance): void => {
    if (session.timer) clearInterval(session.timer);

    session.timer = setInterval(() => {
        const isWhiteTurn: boolean = session.chess.turn() === "w";
        if (isWhiteTurn) {
            session.whiteTimeLeft -= 1000;
            if (session.whiteTimeLeft <= 0) {
                endGame(fastify, session, io, 'Black wins by time');
            }
        } else {
            session.blackTimeLeft -= 1000;
            if (session.blackTimeLeft <= 0) {
                endGame(fastify, session, io, 'White wins by time');
            }
        }

        io.to(session.gameId).emit('timeUpdate', {
            whiteTimeLeft: session.whiteTimeLeft,
            blackTimeLeft: session.blackTimeLeft
        })
    }, 1000)
}

const endGame = async (fastify: FastifyInstance, session: GameSessionInterface, io: SocketIOServer, result: string) => {
    if (session.timer) clearInterval(session.timer);

    const winnerId = result.includes('White') ? session.players[0] : result.includes('Black') ? session.players[1] : null;
    const eloUpdate = await updateElo(fastify.prisma, session.gameId, winnerId);

    session.status = GameStatus.finished

    io.to(session.gameId).emit('gameOver', {
        ...getGameState(session),
        gameOver: true,
        result,
        eloUpdate
    })
    gameSessions.delete(session.gameId)
}

const getGameState = (session: GameSessionInterface) => {
    return {
        fen: session.chess.fen(),
        players: session.players,
        status: session.status,
        turn: session.chess.turn(),
        inCheck: session.chess.inCheck(),
        gameOver: session.chess.isGameOver(),
        whiteTimeLeft: session.whiteTimeLeft,
        blackTimeLeft: session.blackTimeLeft
    };
}

// Handle all the socket connection after successfully connected
export const handleSocketConnection = async (socket: Socket, io: SocketIOServer, fastify: FastifyInstance) => {
    console.log('New client connected:', socket.id);

    // Handle join game with specific Game ID and User ID
    socket.on('joinGame', async ({ gameId, userId }) => {
        // Get in-memory sesion
        let session: GameSessionInterface | null = gameSessions.get(gameId) as GameSessionInterface
        // Get the game session from database
        const gameDoc = await GameSession.findOne({ gameId })

        // Check if the game session existed in the database
        if (!gameDoc) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }

        // If the created game not in the system current session then create new game session
        if (!session) {
            session = {
                gameId,
                players: [userId],
                chess: new Chess(),
                status: gameDoc.status === GameStatus.pending || gameDoc.status === GameStatus.waiting ? GameStatus.waiting : GameStatus.active,
                whiteTimeLeft: gameDoc.whiteTimeLeft || gameDoc.timeLimit,
                blackTimeLeft: gameDoc.blackTimeLeft || gameDoc.timeLimit
            };
            gameSessions.set(gameId, session);
        }

        // If the join player not in the system current session 
        if (session.players.length < 2 && !session.players.includes(userId)) {
            // Add joined player to the session
            session.players.push(userId)

            // Check if the joined player belong to black or white
            if (gameDoc.whitePlayerId && !gameDoc.blackPlayerId) {
                // In case the joined player is belong to black side
                await GameSession.updateOne(
                    { gameId },
                    { $set: { blackPlayerId: userId, status: GameStatus.active } }
                )
                session.status = GameStatus.active;
            } else if (gameDoc.blackPlayerId && !gameDoc.whitePlayerId) {
                // In case the joined player is belong to white side
                await GameSession.updateOne(
                    { gameId },
                    { $set: { whitePlayerId: userId, status: GameStatus.active } }
                )
                session.status = GameStatus.active;
            } else if (!gameDoc.whitePlayerId && !gameDoc.blackPlayerId) {
                // Edge case: No players assigned yet (shouldn't happen), default to Black for second player
                await GameSession.updateOne(
                    { gameId },
                    { $set: { blackPlayerId: userId, status: GameStatus.active } }
                )
                session.status = GameStatus.active
            }
        } else if (!session.players.includes(userId)) {
            // The game session is already full
            socket.emit('error', { message: 'Game full' });
            return;
        }

        // Store info for reconnect
        socket.data = { gameId, userId }
        // Send the user to the room
        socket.join(gameId);
        if (session.status === GameStatus.active) startTimer(session, io, fastify);
        // Send game state to the room => both players can receive
        io.to(gameId).emit('gameState', {
            ...getGameState(session),
            moves: gameDoc.moves,
            playMode: gameDoc.playMode,
            timeLimit: gameDoc.timeLimit
        });
    })

    // Handle move from client side
    socket.on('move', async ({ gameId, move }) => {
        // Get game session
        const session: GameSessionInterface = gameSessions.get(gameId) as GameSessionInterface;
        if (!session || session.status !== GameStatus.active) return;

        try {
            // Let user make a move
            session.chess.move(move);
            const moveNumber = session.chess.history().length;
            await saveMove(gameId, move, moveNumber);

            // Update game state to players in the current game
            const gameState = {
                ...getGameState(session),
                moveNumber,
                move
            };
            io.to(gameId).emit('gameState', gameState)

            // If the game is over after a move
            if (session.chess.isGameOver()) {
                if (session.timer) clearInterval(session.timer);
                session.status = GameStatus.finished;
                await saveGameResult(fastify.prisma, gameId, session.chess);
                gameSessions.delete(gameId)
            } else {
                // Game continue
                startTimer(session, io, fastify);
            }
        } catch (error) {
            socket.emit('invalidMove', { error: 'Invalid Move' })
        }
    })

    // Handle rejoin game
    socket.on('rejoinGame', ({ gameId, userId }) => {
        const session: GameSessionInterface = gameSessions.get(gameId) as GameSessionInterface;
        if (session && session.players.includes(userId)) {
            socket.data = { gameId, userId }
            socket.join(gameId)

            if (session.status === "pause" && session.players.length === 2) {
                session.status = GameStatus.active
                startTimer(session, io, fastify)
                io.to(gameId).emit('gameResumed', { message: 'Opponent reconnected' })
            }
            io.to(gameId).emit('gameState', getGameState(session));
        }
    })

    socket.on('disconnect', () => {
        fastify.log.info(`Client disconnected: ${socket.id}`);
        const gameId = socket.data?.gameId;
        const userId = socket.data?.userId;

        if (!gameId || !userId) return;

        const session: GameSessionInterface = gameSessions.get(gameId) as GameSessionInterface

        if (session && session.players.includes(userId)) {
            if (session.timer) clearInterval(session.timer);

            session.status = GameStatus.paused
            io.to(gameId).emit('opponentDisconnected', { message: 'Waiting for reconnect (30s)' })

            setTimeout(async () => {
                if (session.status === GameStatus.paused) {
                    await endGame(fastify, session, io, `${userId === session.players[0] ? 'Black' : 'White'} wins by disconnect`)
                }
            }, 3000);
        }
    })
}


