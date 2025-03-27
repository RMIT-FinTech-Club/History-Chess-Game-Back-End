import { Socket, Server as SocketIOServer } from 'socket.io';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { GameSession, IGameSession } from '../models/GameSession';
import { PlayMode, GameResult, GameStatus } from '../types/enum';
import * as gameService from "./game.service";

interface WaitingPlayer {
    socket: Socket;
    elo: number;
    userId: string; // Add userId to track the actual user
}
const waitingPlayers: WaitingPlayer[] = [];






export const checkWaitingPlayersForMatches = (io: SocketIOServer, prisma?: PrismaClient) => {
    if (waitingPlayers.length < 2) return;

    for (let i = 0; i < waitingPlayers.length; i++) {
        const player = waitingPlayers[i];

        for (let j = i + 1; j < waitingPlayers.length; j++) {
            const opponent = waitingPlayers[j];

            // Make sure we're not matching the same user (in case they have multiple connections)
            if (player.userId === opponent.userId) continue;

            if (Math.abs(player.elo - opponent.elo) <= 1000) {
                // Remove both players from waiting list 
                waitingPlayers.splice(j, 1);
                waitingPlayers.splice(i, 1);

                // Create game session in memory
                const gameSession = gameService.createNewGameSession(player.socket, opponent.socket);
                const gameId = gameSession.gameId;

                // Store user IDs in the game session for later reference
                gameSession.whitePlayerId = player.userId;
                gameSession.blackPlayerId = opponent.userId;

                // Create game session in database
                gameService.createGameSessionInDatabase(gameId, player.userId, opponent.userId);

                player.socket.join(gameId);
                opponent.socket.join(gameId);

                io.to(gameId).emit('gameStart', {
                    gameId: gameId,
                    initialGameState: gameService.gameSessions[gameId].gameState,
                    whitePlayerId: player.userId,
                    blackPlayerId: opponent.userId
                });

                io.to(player.socket.id).emit('gameJoined', {
                    gameId: gameId,
                    playerColor: 'white',
                    opponentId: opponent.userId
                });

                io.to(opponent.socket.id).emit('gameJoined', {
                    gameId: gameId,
                    playerColor: 'black',
                    opponentId: player.userId
                });

                console.log("Successfully matched players",
                    "White:", player.userId, "(Socket:", player.socket.id, ")",
                    "Black:", opponent.userId, "(Socket:", opponent.socket.id, ")");

                i--;
                break;
            }
        }
    }
}


export const handleDisconnect = async (socket: Socket, reason: string) => {
    // Remove from waiting list if player was waiting
    const index = waitingPlayers.findIndex(player => player.socket.id === socket.id);
    if (index > -1) {
        waitingPlayers.splice(index, 1);
        console.log(`Player removed from waiting list. Reason: ${reason}`);
    }

    // Handle disconnection from active games
    for (const gameId in gameService.gameSessions) {
        const session = gameService.gameSessions[gameId];
        const playerIndex = session.playerSockets.findIndex(s => s.id === socket.id);

        if (playerIndex > -1) {
            const otherPlayerIndex = playerIndex === 0 ? 1 : 0;
            const disconnectedPlayerId = playerIndex === 0 ? session.whitePlayerId : session.blackPlayerId;
            const remainingPlayerId = playerIndex === 0 ? session.blackPlayerId : session.whitePlayerId;
            
            // Notify the other player
            if (session.playerSockets[otherPlayerIndex]) {
                session.playerSockets[otherPlayerIndex].emit('opponentDisconnected', { gameId });
            }

            // Update game result in database - disconnected player loses
            try {
                const prisma = new PrismaClient();
                
                // Update game status in MongoDB
                await GameSession.updateOne(
                    { gameId },
                    {
                        $set: {
                            finalFen: session.gameState,
                            endTime: new Date(),
                            result: disconnectedPlayerId === session.whitePlayerId ? GameResult.blackWins : GameResult.whiteWins,
                            status: GameStatus.finished
                        }
                    }
                );

                // Update game status in NeonDB
                await prisma.games.update({
                    where: { id: gameId },
                    data: { status: 'completed' }
                });

                // Update ELO ratings - disconnected player loses
                if (disconnectedPlayerId && remainingPlayerId) {
                    await gameService.updateElo(prisma, gameId, remainingPlayerId);
                }

                await prisma.$disconnect();
            } catch (error) {
                console.error("Error updating game after disconnect:", error);
            }

            // Remove the game session
            delete gameService.gameSessions[gameId];
            console.log(`Game session ${gameId} ended due to player disconnect`);
            break;
        }
    }
}

export const findMatch = async (socket: Socket, io: SocketIOServer, playerData: { userId: string }) => {
    try {
        // Validate userId first
        if (!playerData || !playerData.userId) {
            io.to(socket.id).emit('error', { message: 'Invalid user ID provided' });
            return;
        }

        // Get the latest ELO from the database instead of using the passed value
        const prisma = new PrismaClient();
        const user = await prisma.users.findUnique({
            where: {
                id: playerData.userId // Now we ensure userId exists
            }
        });

        if (user) {
            console.log("User found in database", user.id, user.elo);
        }

        if (!user) {
            io.to(socket.id).emit('error', { message: 'User not found' });
            return;
        }

        // Use the ELO from the database
        const userElo = user.elo;

        // First check if this player is already in the waiting list
        const existingPlayerIndex = waitingPlayers.findIndex(player =>
            player.socket.id === socket.id || player.userId === playerData.userId
        );

        if (existingPlayerIndex !== -1) {
            io.to(socket.id).emit('alreadyWaiting');
            console.log("Player already in waiting list", socket.id, playerData.userId);
            return;
        }

        // Add the new player to waiting list with userId and database ELO
        waitingPlayers.push({
            socket,
            elo: userElo, // Use ELO from database
            userId: playerData.userId
        });

        io.to(socket.id).emit('waitingForOpponent');
        console.log("Player added to waiting list", socket.id, "User ID:", playerData.userId, "ELO:", userElo);

        // Immediately try to find a match
        checkWaitingPlayersForMatches(io, prisma);

        // Disconnect Prisma client
        await prisma.$disconnect();
    } catch (error) {
        console.error("Error in joinGame:", error);
        io.to(socket.id).emit('error', { message: 'Failed to join game' });
    }
}
