import { Socket, Server as SocketIOServer } from 'socket.io'
import * as GameServices from '../services/game.service';
import * as SocketService from '../services/socket.service';


import { FastifyReply, FastifyRequest } from 'fastify';
// import { createGame, findMatch } from '../services/game.service';

// Socket handler for real-time match finding
// export const handleFindMatch = (socket: Socket, io: SocketIOServer, data: { userId: string, playMode: string, colorPreference: string }): void => {
//     SocketService.findMatch(socket, io, data);
// }

// export const handleDisconnect = (socket: Socket, reason: string): void => {
//     SocketService.handleDisconnect(socket, reason);
// }

// Handle Create New Game Request
// export const createNewGame = async (req: FastifyRequest, res: FastifyReply) => {
//     const { userId, playMode, colorPreference } = req.body as any

//     console.log(userId)
//     console.log(playMode)
//     console.log(colorPreference)
//     const gameId: string = await createGame(req.server.prisma, userId, playMode, colorPreference)
//     const gameLink = `${req.protocol}://${req.hostname}/game/join/${gameId}`;

//     return res.code(201).send({ gameId: gameId, gameLink: gameLink })
// }


export const findNewMatch = async (req: FastifyRequest, res: FastifyReply) => {
    try {
        const { userId, playMode, colorPreference } = req.body as any;
        
        if (!userId) {
            return res.code(400).send({ error: 'userId is required' });
        }

        // Create a new game session or find a match using the game service
        const prisma = (req.server as any).prisma;
        if (!prisma) {
            return res.code(500).send({ error: 'Database connection not available' });
        }

        // Get the user from database to verify existence
        const user = await prisma.users.findUnique({
            where: { id: userId }
        });

        if (!user) {
            console.log("User not found")
            return res.code(404).send({ error: 'User not found' });
        }

        // Return success response
        return res.code(200).send({ 
            message: 'Finding match...',
            userId: user.id,
            elo: user.elo
        });

    } catch (error) {
        console.error('Error in findNewMatch:', error);
        return res.code(500).send({ error: 'Internal server error' });
    }
}

// Handle Challenge Other User Request
export const challengeUser = async (req: FastifyRequest, res: FastifyReply) => {
    const { userId, opponentId, playMode, colorPreference } = req.body as any;

}