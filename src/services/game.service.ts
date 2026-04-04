import { Socket, Server as SocketIOServer } from "socket.io";
import { Chess, Move } from "chess.js";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { GameSession, IGameSession, IMove } from "../models/GameSession";
import { PlayMode, GameResult, GameStatus } from "../types/enum";
import {
  InMemoryGameSession,
  QueuedPlayer,
} from "../types/game.types";
import { CustomSocket } from "../types/socket.types";
import { gameSessions } from "./socket.service";
import { UserRepository } from "../repositories/UserRepository";
import { GameRepository } from "../repositories/GameRepository";
import { GameSessionRepository } from "../repositories/GameSessionRepository";
import { StockfishService } from "./stockfish.service";
import { RabbitMQConnection } from "../configs/rabbitmq";
import { StockfishPublisher } from "../queues/publishers/stockfish.publisher";
import { RewardPublisher } from "../queues/publishers/reward.publisher";
import { SolidityService } from "./solidity.service";

export class GameService {
  private matchmakingQueue: QueuedPlayer[] = [];
  private pendingChallenges: Map<string, any> = new Map();

  constructor(
    private readonly userRepository: UserRepository,
    private readonly gameRepository: GameRepository,
    private readonly gameSessionRepository: GameSessionRepository,
    private readonly stockfishService: StockfishService,
    private readonly solidityService: SolidityService,
    private readonly rabbitMQ: RabbitMQConnection
  ) {}

  async createGame(
    userId: string,
    playMode: PlayMode,
    colorPreference: "white" | "black" | "random" = "random",
    opponentId?: string
  ): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const timeLimit =
      playMode === PlayMode.bullet ? 1 : playMode === PlayMode.blitz ? 3 : 10;
    
    const whitePlayerId =
      colorPreference === "white" ||
      (colorPreference === "random" && Math.random() > 0.5)
        ? userId
        : opponentId;
    const blackPlayerId = whitePlayerId === userId ? opponentId : userId;

    const game = await this.gameRepository.create({
      id: uuidv4(),
      userId: userId,
    });

    await this.gameSessionRepository.create({
      gameId: game.id,
      whitePlayerId: whitePlayerId || null,
      blackPlayerId: blackPlayerId || null,
      startTime: new Date(),
      endTime: null,
      result: GameResult.inProgress,
      status: opponentId ? GameStatus.pending : GameStatus.waiting,
      playMode: playMode,
      timeLimit: timeLimit * 60 * 1000,
      moves: [],
      challengedOpponentId: opponentId || null,
    });

    return game.id;
  }

  async saveMove(
    gameId: string,
    move: string,
    moveNumber: number,
    playerColor: "white" | "black",
    playerId: string,
    moveDuration: number,
    fen: string
  ): Promise<IMove | null> {
    try {
      const moveData: Partial<IMove> = {
        moveNumber: moveNumber,
        move: move,
        fen: fen,
        evaluation: 0,
        bestmove: "",
        mate: null,
        continuation: "",
        playerColor: playerColor === "white" ? "w" : "b",
        playerId,
        initialEvalCP: 0,
        moveEvalCP: 0,
        initialExpectedPoints: 0,
        moveExpectedPoints: 0,
        bestMoveExpectedPoints: 0,
        expectedPointsLost: 0,
        classification: "Analyzing...",
        timestamp: new Date(),
        duration: moveDuration / 1000,
      };

      await this.gameSessionRepository.addMove(gameId, moveData);

      const session = gameSessions.get(gameId);
      if (!session || !session.chess) {
        throw new Error("Game session not found for analysis.");
      }

      const fullHistory: Move[] = session.chess.history({ verbose: true });
      const currentMoveDetails = fullHistory[moveNumber - 1];

      if (!currentMoveDetails) {
        throw new Error(`Could not locate chess.js Move object for move ${moveNumber}.`);
      }

      const tempChessBeforeMove = new Chess();
      for (let i = 0; i < moveNumber - 1; i++) {
        tempChessBeforeMove.move(fullHistory[i]);
      }
      const fenBeforeMove = tempChessBeforeMove.fen();

      if (this.rabbitMQ.isConnected()) {
        await StockfishPublisher.publishMoveAnalysis({
          gameId,
          fenBeforeMove,
          moveDetails: currentMoveDetails,
          moveNumber
        });

        return {
          move: currentMoveDetails.san,
          fen: currentMoveDetails.after,
          playerColor: moveData.playerColor,
          playerId,
          moveNumber,
          classification: 'Analyzing...'
        } as unknown as IMove;
      } else {
        throw new Error('RabbitMQ not connected.');
      }
    } catch (error) {
      console.error(`Analysis failed for game ${gameId} move ${moveNumber}:`, error);
      return null;
    }
  }

  async saveGameResult(gameId: string, resultString: string) {
    let result: GameResult = GameResult.inProgress;
    let winner: string | null = null;

    if (resultString.includes("White wins")) {
      result = GameResult.whiteWins;
      const game = await this.gameSessionRepository.findByGameId(gameId);
      winner = game?.whitePlayerId || null;
    } else if (resultString.includes("Black wins")) {
      result = GameResult.blackWins;
      const game = await this.gameSessionRepository.findByGameId(gameId);
      winner = game?.blackPlayerId || null;
    } else if (resultString.includes("Draw")) {
      result = GameResult.draw;
    }

    await this.gameSessionRepository.update(gameId, {
      endTime: new Date(),
      result,
      winner,
      status: GameStatus.finished,
    });
  }

  async calculateGameAccuracy(gameId: string): Promise<void> {
    const gameSession = await this.gameSessionRepository.findByGameId(gameId);
    if (!gameSession || !gameSession.moves) return;

    const whiteMoves = gameSession.moves.filter(m => m.playerColor === "w");
    const blackMoves = gameSession.moves.filter(m => m.playerColor === "b");

    const whiteAccuracy = await this.stockfishService.calculateGameAccuracy(whiteMoves);
    const blackAccuracy = await this.stockfishService.calculateGameAccuracy(blackMoves);

    await this.gameSessionRepository.update(gameId, {
      whiteAccuracyPoint: whiteAccuracy,
      blackAccuracyPoint: blackAccuracy,
    });
  }

  async findMatch(
    userId: string,
    playMode: PlayMode,
    colorChoice: "white" | "black" | "random",
    socketId: string
  ): Promise<{ gameId: string; matchedPlayer: { userId: string; socketId: string } } | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    const eloRange = 1000;
    const minElo = user.elo - eloRange;
    const maxElo = user.elo + eloRange;

    const queuedPlayer: QueuedPlayer = {
      userId,
      socketId,
      playMode,
      colorChoice,
      elo: user.elo,
      timestamp: Date.now(),
    };

    const existingIndex = this.matchmakingQueue.findIndex(p => p.userId === userId);
    if (existingIndex !== -1) {
      this.matchmakingQueue[existingIndex] = queuedPlayer;
    } else {
      this.matchmakingQueue.push(queuedPlayer);
    }

    const matchIndex = this.matchmakingQueue.findIndex(player => {
      if (player.userId === userId) return false;
      if (player.playMode !== playMode) return false;
      if (player.elo < minElo || player.elo > maxElo) return false;
      if (colorChoice === "white" && player.colorChoice === "white") return false;
      if (colorChoice === "black" && player.colorChoice === "black") return false;
      return true;
    });

    if (matchIndex !== -1) {
      const matchedPlayer = this.matchmakingQueue[matchIndex];
      this.matchmakingQueue.splice(matchIndex, 1);
      const currentPlayerIndex = this.matchmakingQueue.findIndex(p => p.userId === userId);
      if (currentPlayerIndex !== -1) this.matchmakingQueue.splice(currentPlayerIndex, 1);

      const gameId = uuidv4();
      await this.gameRepository.create({ id: gameId, userId, status: "active" });

      let whitePlayerId, blackPlayerId, whitePlayerElo, blackPlayerElo;
      if (colorChoice === "white" || (colorChoice === "random" && matchedPlayer.colorChoice !== "white")) {
        whitePlayerId = userId; blackPlayerId = matchedPlayer.userId;
        whitePlayerElo = user.elo; blackPlayerElo = matchedPlayer.elo;
      } else {
        whitePlayerId = matchedPlayer.userId; blackPlayerId = userId;
        whitePlayerElo = matchedPlayer.elo; blackPlayerElo = user.elo;
      }

      await this.gameSessionRepository.create({
        gameId,
        whitePlayerId,
        blackPlayerId,
        whitePlayerElo,
        blackPlayerElo,
        startTime: new Date(),
        result: GameResult.inProgress,
        status: GameStatus.active,
        playMode,
        timeLimit: (playMode === PlayMode.bullet ? 1 : playMode === PlayMode.blitz ? 3 : 10) * 60 * 1000,
        moves: [],
      });

      return { gameId, matchedPlayer: { userId: matchedPlayer.userId, socketId: matchedPlayer.socketId } };
    }

    return null;
  }

  removeFromMatchmaking(userId: string) {
    const index = this.matchmakingQueue.findIndex(p => p.userId === userId);
    if (index !== -1) this.matchmakingQueue.splice(index, 1);
  }

  async updateElo(gameId: string, winnerId: string | null) {
    const game = await this.gameSessionRepository.findByGameId(gameId);
    if (!game || !game.whitePlayerId || !game.blackPlayerId) return;

    const [whiteUser, blackUser] = await Promise.all([
      this.userRepository.findById(game.whitePlayerId),
      this.userRepository.findById(game.blackPlayerId),
    ]);

    if (whiteUser && blackUser) {
      const Ra = whiteUser.elo;
      const Rb = blackUser.elo;
      const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
      const Eb = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));
      const K = 32;

      let whiteScore, blackScore;
      if (winnerId === whiteUser.id) {
        whiteScore = 1; blackScore = 0;
      } else if (winnerId === blackUser.id) {
        whiteScore = 0; blackScore = 1;
      } else {
        whiteScore = blackScore = 0.5;
      }

      const newWhiteElo = Math.round(Ra + K * (whiteScore - Ea));
      const newBlackElo = Math.round(Rb + K * (blackScore - Eb));

      await Promise.all([
        this.userRepository.updateElo(whiteUser.id, newWhiteElo),
        this.userRepository.updateElo(blackUser.id, newBlackElo),
      ]);

      try {
        await this.solidityService.updateAfterGameSolidity(whiteUser.id, newWhiteElo, blackUser.id, newBlackElo);
      } catch (err) {
        console.warn("Blockchain ELO update failed:", err);
      }

      if (winnerId) {
        const winner = winnerId === whiteUser.id ? whiteUser : blackUser;
        if (winner.walletAddress) {
          await RewardPublisher.publishReward({
            userId: winner.id,
            username: winner.username,
            walletAddress: winner.walletAddress,
            amount: "10",
            gameId,
            matchType: 'PvP',
            gameRewardId: gameId,
            timestamp: new Date(),
            transactionType: 'reward',
          });
        }
      }

      return { whiteElo: newWhiteElo, blackElo: newBlackElo };
    }
  }

  async challengeUser(io: SocketIOServer, challengerSocket: CustomSocket, opponentId: string, playMode: PlayMode, colorPreference: "white" | "black" | "random") {
    const challengerId = challengerSocket.data.userId;
    if (!challengerId) return { success: false, message: "Challenger not identified" };

    const [challenger, opponent] = await Promise.all([
      this.userRepository.findById(challengerId),
      this.userRepository.findById(opponentId),
    ]);

    if (!challenger || !opponent) return { success: false, message: "User(s) not found" };

    const opponentSocket = Array.from(io.sockets.sockets.values()).find(s => s.data.userId === opponentId);
    if (!opponentSocket) return { success: false, message: "Opponent offline" };

    const timer = setTimeout(() => {
      this.pendingChallenges.delete(opponentId);
      challengerSocket.emit("challengeExpired", { opponentId });
    }, 30000);

    this.pendingChallenges.set(opponentId, { challengerId, timer, challengerSocket, opponentSocket, playMode, colorPreference });
    opponentSocket.emit("gameChallenge", { challengerId, challengerName: challenger.username, playMode, colorPreference });

    return { success: true, message: "Challenge sent" };
  }

  async respondToChallenge(io: SocketIOServer, opponentSocket: CustomSocket, accept: boolean) {
    const challenge = this.pendingChallenges.get(opponentSocket.data.userId!);
    if (!challenge) return { success: false, message: "No challenge found" };

    clearTimeout(challenge.timer);
    this.pendingChallenges.delete(opponentSocket.data.userId!);

    challenge.challengerSocket.emit("challengeResponse", { accepted: accept });
    if (!accept) return { success: false, message: "Declined" };

    const gameId = await this.createGame(challenge.challengerId, challenge.playMode, challenge.colorPreference, opponentSocket.data.userId);
    io.to([challenge.challengerSocket.id, challenge.opponentSocket.id]).emit("gameStarting", { gameId, playMode: challenge.playMode });

    return { success: true, gameId };
  }

  async getGameMoves(gameId: string) {
    const session = await this.gameSessionRepository.findByGameId(gameId);
    return session?.moves || [];
  }

  async getGameHistories(userId: string) {
    return this.gameSessionRepository.findByPlayerId(userId);
  }

  async getGameAnalysis(gameId: string) {
    const gameSession = await this.gameSessionRepository.findByGameId(gameId);
    if (!gameSession) {
      throw new Error("Game not found");
    }

    if (!gameSession.moves || gameSession.moves.length === 0) {
      throw new Error("No moves found for this game");
    }

    const whiteAccuracy = gameSession.whiteAccuracyPoint;
    const blackAccuracy = gameSession.blackAccuracyPoint;
    const moves = gameSession.moves.map((move) => ({
      moveNumber: move.moveNumber,
      move: move.move,
      evaluation: move.evaluation,
      bestmove: move.bestmove ? move.bestmove.split(" ")[0] : '',
      mate: move.mate,
      continuation: move.continuation,
      classification: move.classification,
    }));

    return {
      whiteAccuracy,
      blackAccuracy,
      moves
    };
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
