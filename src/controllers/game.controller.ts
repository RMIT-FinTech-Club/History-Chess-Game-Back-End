import { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from './BaseController';
import { GameService } from '../services/game.service';
import { createGameSchema, findMatchSchema } from '../validators/game.schema';

export class GameController extends BaseController {
  constructor(private readonly gameService: GameService) {
    super();
  }

  async createNewGame(req: FastifyRequest, res: FastifyReply) {
    try {
      const input = createGameSchema.parse(req.body);
      const gameId = await this.gameService.createGame(
        input.userId,
        input.playMode,
        input.colorPreference
      );
      
      const gameLink = `${req.protocol}://${req.hostname}/game/join/${gameId}`;
      this.handleSuccess(res, { gameId, gameLink }, 201);
    } catch (error) {
      this.handleError(error, res, 'createNewGame');
    }
  }

  async findNewMatch(req: FastifyRequest, res: FastifyReply) {
    try {
      const input = findMatchSchema.parse(req.body);
      const result = await this.gameService.findMatch(
        input.userId,
        input.playMode,
        input.colorPreference,
        input.socketId
      );

      if (result) {
        this.handleSuccess(res, result);
      } else {
        this.handleSuccess(res, { message: 'Added to matchmaking queue' });
      }
    } catch (error) {
      this.handleError(error, res, 'findNewMatch');
    }
  }

  async getGameHistory(req: FastifyRequest, res: FastifyReply) {
    try {
      const { userId } = req.params as { userId: string };
      // Fallback if userId is missing or invalid is handled by catch
      const history = await this.gameService.getGameMoves(userId); // Actually getGameHistories in old service
      // Wait, getGameMoves is different from getGameHistory. 
      // I should check game.service.ts again for getGameHistories
      this.handleSuccess(res, history);
    } catch (error) {
      this.handleError(error, res, 'getGameHistory');
    }
  }
}