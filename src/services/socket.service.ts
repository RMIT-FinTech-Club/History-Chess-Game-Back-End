import { Server as SocketIOServer, Socket } from "socket.io"
import { Chess } from "chess.js"
import fastify, { FastifyInstance } from "fastify"
import { GameSession, IGameSession } from "../models/GameSession"
import { GameStatus, PlayMode } from '../types/enum'
import { InMemoryGameSession } from '../types/game.types';
import * as GameService from "./game.service"

const gameSessions = new Map<string, InMemoryGameSession>();
const onlineUsers = new Map<string, { userId: string; socketId: string; lastSeen: Date }>();

const startTimer = (session: InMemoryGameSession, io: SocketIOServer, fastify: FastifyInstance): void => {
    if (session.timer) clearInterval(session.timer);
    console.log("Starting timer for gameId:", session.gameId);
    console.log("Timer interval:", session.whiteTimeLeft);
        
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

const endGame = async (fastify: FastifyInstance, session: InMemoryGameSession, io: SocketIOServer, result: string) => {
    if (session.timer) clearInterval(session.timer);

    const winnerId = result.includes('White') ? session.players[0] : result.includes('Black') ? session.players[1] : null;
    const eloUpdate = await GameService.updateElo(fastify.prisma, session.gameId, winnerId);
    
    // Save the game result to the database
    await GameService.saveGameResult(session.gameId, result);
    
    // Log the winner for debugging
    console.log(`Game ${session.gameId} ended. Result: ${result}. Winner: ${winnerId || 'Draw'}`);

    session.status = GameStatus.finished

    io.to(session.gameId).emit('gameOver', {
        ...getGameState(session),
        gameOver: true,
        result,
        eloUpdate
    })
    gameSessions.delete(session.gameId)
}

const getGameState = (session: InMemoryGameSession) => {
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


export const handleMove = async (socket: Socket, io: SocketIOServer, fastify: FastifyInstance, gameId: string, move: string, userId: string) => {
    console.log("Handling move for gameId:", gameId);
    console.log("Current game sessions:", Array.from(gameSessions.keys()));

    const session = gameSessions.get(gameId);
    // console.log("Session: ", session);
    if (!session) {
      console.log("Game session not found for gameId:", gameId);
      socket.emit('error', { message: 'Game session not found' });
      return;
    }

    // Use the userId passed directly from the client
    const currentPlayerId = userId;
    if (!currentPlayerId) {
      socket.emit('error', { message: 'Player not identified' });
      return;
    }

    // Check if it's this player's turn
    const isWhiteTurn = session.chess.turn() === 'w';
    const whitePlayerId = session.players[0]; // First player is white
    const blackPlayerId = session.players[1]; // Second player is black
    
    if ((isWhiteTurn && currentPlayerId !== whitePlayerId) || 
        (!isWhiteTurn && currentPlayerId !== blackPlayerId)) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    try {
        // Make the move in memory
        session.chess.move(move);
    
        // Save the move to the database with player color and ID
        const moveNumber = session.chess.history().length;
        const color = isWhiteTurn ? 'white' : 'black';
        await GameService.saveMove(gameId, move, moveNumber, color, currentPlayerId);
    
        // Broadcast the move to all players
        io.to(gameId).emit('gameState', {
            ...getGameState(session),
            moveNumber,
            move,
            color,
            playerId: currentPlayerId
        });   

      // If the game is already finished, send the final state
      if (session && session.status === GameStatus.finished) {
          const gameState = getGameState(session);
          let result = '';
          if (session.chess.isCheckmate()) {
              result = `Checkmate! ${session.chess.turn() === 'w' ? 'Black' : 'White'} wins!`;
          } else if (session.chess.isDraw()) {
              result = 'Draw!';
          } else if (session.chess.isStalemate()) {
              result = 'Draw by stalemate!';
          } else if (session.chess.isThreefoldRepetition()) {
              result = 'Draw by threefold repetition!';
          } else if (session.chess.isInsufficientMaterial()) {
              result = 'Draw by insufficient material!';
          }
          io.to(gameId).emit('gameOver', { 
              message: 'Game over', 
              gameState,
              result
          });
      }

      // Check if the game is over
      if (session && session.chess.isGameOver()) {
          let result = '';
          
          if (session.chess.isCheckmate()) {
              result = session.chess.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
          } else if (session.chess.isDraw()) {
              if (session.chess.isStalemate()) {
                  result = 'Draw by stalemate';
              } else if (session.chess.isThreefoldRepetition()) {
                  result = 'Draw by repetition';
              } else if (session.chess.isInsufficientMaterial()) {
                  result = 'Draw by insufficient material';
              } else {
                  result = 'Draw';
              }
          }
          
          await endGame(fastify, session, io, result);
      } else {
          // Game continues
          if (session) startTimer(session, io, fastify);
      }
    }
    catch (error) {
      console.error("Error handling move:", error);
      socket.emit('error', { message: 'Invalid move' });
    }
}

// Handle all the socket connection after successfully connected
export const handleSocketConnection = async (socket: Socket, io: SocketIOServer, fastify: FastifyInstance) => {
    console.log('New client connected:', socket.id);

    // Track user connection
    socket.on('identify', (userId: string) => {
        if (!userId) return;
        
        // Remove user from any previous connections
        for (const [id, user] of onlineUsers.entries()) {
            if (user.userId === userId) {
                onlineUsers.delete(id);
            }
        }
        
        // Add new connection
        onlineUsers.set(socket.id, {
            userId,
            socketId: socket.id,
            lastSeen: new Date()
        });
        
        // Notify all clients about the updated online users
        io.emit('onlineUsers', Array.from(onlineUsers.values()).map(u => u.userId));
    });

    // Handle game challenge
    socket.on('challengeUser', async (data: {
        opponentId: string,
        playMode: PlayMode,
        colorPreference: 'white' | 'black' | 'random'
    }) => {
        const result = await GameService.challengeUser(
            fastify.prisma,
            io,
            socket,
            data.opponentId,
            data.playMode,
            data.colorPreference
        );

        if (!result.success) {
            socket.emit('challengeError', result);
        }
    });

    // Handle challenge response
    socket.on('respondToChallenge', async (data: { accept: boolean }) => {
        const result = await GameService.respondToChallenge(
            fastify.prisma,
            io,
            socket,
            data.accept
        );

        if (!result.success) {
            socket.emit('challengeError', result);
        }
    });

    // Handle get online users
    socket.on('getOnlineUsers', () => {
        const users = Array.from(onlineUsers.values()).map(u => u.userId);
        socket.emit('onlineUsers', users);
    });

    // Handle find match request
    socket.on('findMatch', async ({ userId, playMode, colorChoice }) => {
        try {
            const result = await GameService.findMatch(
                fastify.prisma,
                userId,
                playMode,
                colorChoice,
                socket.id
            );

            if (result) {
                // Match found, notify both players
                const { gameId, matchedPlayer } = result;
                
                // Notify the matched player
                io.to(matchedPlayer.socketId).emit('matchFound', {
                    gameId,
                    playMode,
                    colorChoice
                });

                // Notify the current player
                socket.emit('matchFound', {
                    gameId,
                    playMode,
                    colorChoice
                });
            } else {
                // No match found, player is in queue
                socket.emit('inQueue', {
                    message: 'Waiting for opponent...'
                });
            }
        } catch (error) {
            console.error('Error in findMatch:', error);
            socket.emit('error', { message: 'Failed to find match' });
        }
    });

    // Handle cancel matchmaking
    socket.on('cancelMatchmaking', ({ userId }) => {
        GameService.removeFromMatchmaking(userId);
        socket.emit('matchmakingCancelled');
    });

    // Handle join game with specific Game ID and User ID
    socket.on('joinGame', async ({ gameId, userId }) => {
        let session: InMemoryGameSession | null = gameSessions.get(gameId) as InMemoryGameSession;
        console.log("Joining game with ID:", gameId);
        
        // Get the game session from database
        const gameDoc = await GameSession.findOne({ gameId });

        // Check if the game session existed in the database
        if (!gameDoc || !gameDoc.whitePlayerId || !gameDoc.blackPlayerId) {
            console.log("Game not found in database or missing player information:", gameId);
            socket.emit('error', { message: 'Game not found or invalid' });
            return;
        }

        // If the game not in the system current session then create new game session
        if (!session) {
            console.log("Creating new game session for:", gameId);
            session = {
                gameId,
                players: [gameDoc.whitePlayerId, gameDoc.blackPlayerId], // Set players in correct order
                playerSockets: [socket],
                chess: new Chess(),
                status: GameStatus.active,
                whiteTimeLeft: gameDoc.whiteTimeLeft || gameDoc.timeLimit,
                blackTimeLeft: gameDoc.blackTimeLeft || gameDoc.timeLimit,
                gameState: ''
            };
            gameSessions.set(gameId, session);
        }

        // Join the game room
        socket.join(gameId);
        
        // Send current game state to the joining player
        if (session) {
            const gameState = {
                ...getGameState(session),
                playerColor: userId === gameDoc.whitePlayerId ? 'white' : 'black'
            };
            socket.emit('gameState', gameState);

            // If both players have joined, start the game
            if (session.playerSockets.length === 2) {
                startTimer(session, io, fastify);
                
                // Notify both players that the game is starting
                io.to(gameId).emit('gameStart', {
                    gameId: gameId,
                    initialGameState: session.chess.fen(),
                    players: session.players,
                    whiteTimeLeft: session.whiteTimeLeft,
                    blackTimeLeft: session.blackTimeLeft,
                    whitePlayerId: gameDoc.whitePlayerId,
                    blackPlayerId: gameDoc.blackPlayerId
                });
            }
        }
    });

    // Handle move from client side
    socket.on('move', async ({ gameId, move, userId }) => {
        await handleMove(socket, io, fastify, gameId, move, userId);
    })

    // Handle rejoin game
    socket.on('rejoinGame', ({ gameId, userId }) => {
        const session = gameSessions.get(gameId);
        if (session && session.players.includes(userId)) {
            socket.data = { gameId, userId }
            socket.join(gameId)

            if (session && session.players.length === 2 && session.status === GameStatus.paused) {
                session.status = GameStatus.active;
                startTimer(session, io, fastify);
                io.to(gameId).emit('gameResumed', { message: 'Opponent reconnected' });
            }
            if (session) io.to(gameId).emit('gameState', getGameState(session));
        }
    })

    socket.on('disconnect', () => {
        fastify.log.info(`Client disconnected: ${socket.id}`);
        
        // Remove user from online users
        if (onlineUsers.has(socket.id)) {
            const { userId } = onlineUsers.get(socket.id)!;
            onlineUsers.delete(socket.id);
            // Notify all clients about the updated online users
            io.emit('onlineUsers', Array.from(onlineUsers.values()).map(u => u.userId));
        }
        
        const gameId = socket.data?.gameId;
        const userId = socket.data?.userId;

        if (!gameId || !userId) return;

        const session: InMemoryGameSession = gameSessions.get(gameId) as InMemoryGameSession

        if (session && session.players.includes(userId)) {
            if (session.timer) clearInterval(session.timer);

            session.status = GameStatus.paused
            io.to(gameId).emit('opponentDisconnected', { message: 'Waiting for reconnect (30s)' })

            setTimeout(async () => {
                if (session && session.status === GameStatus.paused) {
                    await endGame(fastify, session, io, `${userId === session.players[0] ? 'Black' : 'White'} wins by disconnect`)
                }
            }, 3000);
        }
    })
}


