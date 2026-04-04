import { PrismaClient } from '@prisma/client';
import { UserRepository } from '../repositories/UserRepository';
import { GameRepository } from '../repositories/GameRepository';
import { GameSessionRepository } from '../repositories/GameSessionRepository';
import { UserService } from '../services/user.service';
import { GameService } from '../services/game.service';
import { StockfishService } from '../services/stockfish.service';
import { SolidityService } from '../services/solidity.service';
import { RabbitMQConnection } from './rabbitmq';
import { FastifyInstance } from 'fastify';
import { UserController } from '../controllers/user.controller';
import { GameController } from '../controllers/game.controller';
import { MarketController } from '../controllers/market.controller';
import { MarketService } from '../services/market.service';
import { BlockchainService } from '../services/blockchain.service';

export class CompositionRoot {
  private static instance: CompositionRoot;
  
  public userRepository!: UserRepository;
  public gameRepository!: GameRepository;
  public gameSessionRepository!: GameSessionRepository;
  public userService!: UserService;
  public gameService!: GameService;
  public userController!: UserController;
  public gameController!: GameController;
  public marketService!: MarketService;
  public marketController!: MarketController;

  private constructor(fastify: FastifyInstance, prisma: PrismaClient) {
    const rabbitMQ = RabbitMQConnection.getInstance();
    const stockfishService = new StockfishService();
    const solidityService = new SolidityService();

    this.userRepository = new UserRepository(prisma);
    this.gameRepository = new GameRepository(prisma);
    this.gameSessionRepository = new GameSessionRepository();

    this.userService = new UserService(fastify, this.userRepository);
    this.gameService = new GameService(
      this.userRepository,
      this.gameRepository,
      this.gameSessionRepository,
      stockfishService,
      solidityService,
      rabbitMQ
    );

    this.userController = new UserController(this.userService);
    this.gameController = new GameController(this.gameService);
    const blockchainService = new BlockchainService();
    this.marketService = new MarketService(prisma, blockchainService, rabbitMQ);
    this.marketController = new MarketController(this.marketService);
  }

  public static initialize(fastify: FastifyInstance, prisma: PrismaClient): CompositionRoot {
    if (!CompositionRoot.instance) {
      CompositionRoot.instance = new CompositionRoot(fastify, prisma);
    }
    return CompositionRoot.instance;
  }

  public static getInstance(): CompositionRoot {
    if (!CompositionRoot.instance) {
      throw new Error('CompositionRoot not initialized');
    }
    return CompositionRoot.instance;
  }
}
