import { Socket, Server as SocketIOServer } from 'socket.io'
import * as GameServices from '../services/game.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { createGame, findMatch, retrieveGameSessions, retrieveGameMoves } from '../services/game.service';

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
    const { userId, playMode, colorPreference } = req.body as any;


    const gameId = await findMatch(req.server.prisma, userId, playMode, colorPreference);


    console.log("\n GAME STARTED\n")
    return res.code(200).send({gameId})
}

// Handle Challenge Other User Request
export const challengeUser = async (req: FastifyRequest, res: FastifyReply) => {
    const { userId, opponentId, playMode, colorPreference } = req.body as any;

}

export const getUserGameHistory = async (req: FastifyRequest, res: FastifyReply) => {
    const { userId } = req.params as any;
    const { limit, skip, status, playMode } = req.query as any;
    
    try {
      const history = await retrieveGameSessions(userId, {
        limit: limit ? parseInt(limit) : undefined,
        skip: skip ? parseInt(skip) : undefined,
        status,
        playMode
      });
      
      return res.send(history);
    } catch (error) {
      console.error("Error retrieving game history:", error);
      return res.status(500).send({ error: "Failed to retrieve game history" });
    }
  };
  
  export const getGameMoves = async (req: FastifyRequest, res: FastifyReply) => {
    const { gameId } = req.params as any;
    
    try {
      const moves = await retrieveGameMoves(gameId);
      return res.send(moves);
    } catch (error) {
      console.error("Error retrieving game moves:", error);
      return res.status(404).send({ error: "Game not found or moves unavailable" });
    }
  };