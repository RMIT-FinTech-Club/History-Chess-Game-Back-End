import { GameSession, IGameSession, IMove } from '../models/GameSession';

export class GameSessionRepository {
  async create(data: Partial<IGameSession>): Promise<IGameSession> {
    return GameSession.create(data);
  }

  async findByGameId(gameId: string): Promise<IGameSession | null> {
    return GameSession.findOne({ gameId }).exec();
  }

  async findByPlayerId(playerId: string): Promise<IGameSession[]> {
    return GameSession.find({
      $or: [{ whitePlayerId: playerId }, { blackPlayerId: playerId }],
    })
    .sort({ startTime: -1 })
    .exec();
  }

  async update(gameId: string, data: Partial<IGameSession>): Promise<IGameSession | null> {
    return GameSession.findOneAndUpdate({ gameId }, { $set: data }, { new: true }).exec();
  }

  async addMove(gameId: string, move: Partial<IMove>): Promise<IGameSession | null> {
    return GameSession.findOneAndUpdate(
      { gameId },
      { $push: { moves: move } },
      { new: true }
    ).exec();
  }

  /**
   * Update a specific move in the session
   */
  async updateMove(gameId: string, moveNumber: number, data: Partial<IMove>): Promise<void> {
    await GameSession.updateOne(
      { gameId, 'moves.moveNumber': moveNumber },
      { $set: { 'moves.$': data } }
    ).exec();
  }
}
