import { PrismaClient, users } from '@prisma/client';

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<users | null> {
    return this.prisma.users.findUnique({
      where: { id },
    });
  }

  async findByUsername(username: string): Promise<users | null> {
    return this.prisma.users.findUnique({
      where: { username },
    });
  }

  async findByEmail(email: string): Promise<users | null> {
    return this.prisma.users.findUnique({
      where: { email },
    });
  }

  async updateElo(id: string, newElo: number): Promise<users> {
    return this.prisma.users.update({
      where: { id },
      data: { elo: newElo },
    });
  }

  async updateXp(id: string, data: { dynastyXp: number; level?: number }): Promise<users> {
    return this.prisma.users.update({
      where: { id },
      data,
    });
  }
}
