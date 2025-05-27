import { PrismaClient } from "@prisma/client";
import { LeaderboardEntry } from "../routes/schemas/leaderboardSchema";

export const getLeaderboardService = {
  async fetchLeaderboard(
    prisma: PrismaClient,
    pageSize: number = 20,
    offset: number,
    sortBy: 'elo' | 'username' = 'elo',
    sortDir: 'asc' | 'desc' = 'desc'
  ) {
    try {
      const orderBy: any = {};
      orderBy[sortBy] = sortDir;

      const [users, totalRecords] = await prisma.$transaction([
        prisma.users.findMany({
          select: {
            id: true,
            username: true,
            elo: true,
          },
          orderBy: orderBy,
          skip: offset,
          take: pageSize,
        }),
        prisma.users.count(),
      ]);

      if (!users || users.length === 0) {
        return {
          leaderboard: [],
          totalRecords,
        };
      }

      const leaderboardEntries: LeaderboardEntry[] = users.map((user, index) => ({
        rank: offset + index + 1,
        id: user.id,
        username: user.username,
        elo: user.elo,
      }));

      return {
        leaderboard: leaderboardEntries,
        totalRecords,
      };
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      throw new Error("Failed to fetch leaderboard data.");
    }
  },
};
