import { PrismaClient, games, users } from '@prisma/client';

export class GameRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { id: string; userId: string; status?: string }): Promise<games> {
    return this.prisma.games.create({
      data,
    });
  }

  async findById(id: string): Promise<games | null> {
    return this.prisma.games.findUnique({
      where: { id },
    });
  }

  async findByUserId(userId: string): Promise<games[]> {
    return this.prisma.games.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
