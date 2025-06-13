import { Socket, Server as SocketIOServer } from 'socket.io'
import * as GameServices from '../services/game.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { createGame, findMatch } from '../services/game.service';
import { PrismaClient } from '@prisma/client';
import { PlayMode } from '../types/enum';

// export const handleJoinGame = (socket: Socket, io: SocketIOServer, playerElo: number): void => {
//     GameServices.joinGame(socket, io, playerElo);
// }

export const handleDisconnect = (socket: Socket, reason: string): void => {
    GameServices.handleDisconnect(socket, reason);
}

// Handle Create New Game Request
export const createNewGame = async (req: FastifyRequest, res: FastifyReply) => {
    const { userId, playMode, colorPreference } = req.body as any
    console.log(userId)
    console.log(playMode)
    console.log(colorPreference)
    const gameId: string = await createGame(req.server.prisma, userId, playMode, colorPreference)
    const gameLink = `${req.protocol}://${req.hostname}/game/join/${gameId}`;

    return res.code(201).send({ gameId: gameId, gameLink: gameLink })
}

// Handle Find Match Request
export const findNewMatch = async (req: FastifyRequest, res: FastifyReply) => {
    const { userId, playMode, colorPreference, socketId } = req.body as any;
    
    if (!socketId) {
        return res.code(400).send({ error: 'Socket ID is required' });
    }

    const result = await findMatch(req.server.prisma, userId, playMode, colorPreference, socketId);
    console.log("\n MATCHMAKING RESULT\n", result);
    
    if (result) {
        return res.code(200).send(result);
    } else {
        return res.code(200).send({ message: 'Added to matchmaking queue' });
    }
}

export const handleGameChallenge = async (
    socket: Socket,
    io: SocketIOServer,
    prisma: PrismaClient,
    data: {
        opponentId: string,
        playMode: PlayMode,
        colorPreference: 'white' | 'black' | 'random'
    }
) => {
    const result = await GameServices.challengeUser(
        prisma,
        io,
        socket,
        data.opponentId,
        data.playMode,
        data.colorPreference
    );

    if (!result.success) {
        socket.emit('challengeError', result);
    }
};

export const handleChallengeResponse = async (
    socket: Socket,
    io: SocketIOServer,
    prisma: PrismaClient,
    data: {
        accept: boolean
    }
) => {
    const result = await GameServices.respondToChallenge(
        prisma,
        io,
        socket,
        data.accept
    );

    if (!result.success) {
        socket.emit('challengeError', result);
    }
};