import { Socket, Server as SocketIOServer } from 'socket.io'
import * as GameServices from '../services/game.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { createGame, findMatch } from '../services/game.service';

export const handleJoinGame = (socket: Socket, io: SocketIOServer, playerElo: number): void => {
    GameServices.joinGame(socket, io, playerElo);
}

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
    const { userId, playMode, colorPreference } = req.body as any;
    const gameId = await findMatch(req.server.prisma, userId, playMode, colorPreference);
    return res.code(200).send({ gameId });
}

// Handle Challenge Other User Request
export const challengeUser = async (req: FastifyRequest, res: FastifyReply) => {
    const { userId, opponentId, playMode, colorPreference } = req.body as any;

}