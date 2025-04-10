import { PrismaClient } from "@prisma/client";
import { GameSession } from "../models/GameSession";
import { LeaderboardEntry } from "../routes/schemas/leaderboardSchema";
import { GameResult, GameStatus } from "../types/enum";

interface UserGameStats {
  _id: string;
  wins: number;
  losses: number;
  draws: number;
}

export const getLeaderboardService = {
  async fetchLeaderboard(
    prisma: PrismaClient,
    pageSize: number = 20,
    offset: number
  ) {
    try {
      const [users, totalRecords] = await prisma.$transaction([
        prisma.users.findMany({
          select: {
            id: true,
            username: true,
            elo: true,
          },
          orderBy: {
            elo: "desc",
          },
          skip: offset,
          take: pageSize,
        }),
        prisma.users.count(),
      ]);

      // If no users found, return early
      if (!users || users.length === 0) {
        return {
          leaderboard: [],
          totalRecords,
        };
      }

      // Extract user IDs to query MongoDB
      const userIds = users.map((user) => user.id);

      // Fetch game statistics from MongoDB using aggregation
      const gameStats: UserGameStats[] = await GameSession.aggregate([
        // Match finished games involving the fetched users
        {
          $match: {
            status: GameStatus.finished,
            $or: [
              { whitePlayerId: { $in: userIds } },
              { blackPlayerId: { $in: userIds } },
            ],
          },
        },
        // Project fields needed for calculating wins/losses/draws
        {
          $project: {
            whitePlayerId: 1,
            blackPlayerId: 1,
            result: 1,
          },
        },
        /*
        Sample output
        [
            {
                "_id": "game1",
                "whitePlayerId": "1",
                "blackPlayerId": "3",
                "result": "whiteWins"
            },
            {
                "_id": "game2",
                "whitePlayerId": "1",
                "blackPlayerId": "4",
                "result": "blackWins"
            },
            {
                "_id": "game3",
                "whitePlayerId": "2",
                "blackPlayerId": "5",
                "result": "draw"
            },
            {
                "_id": "game4",
                "whitePlayerId": "2",
                "blackPlayerId": "6",
                "result": "draw"
            },
            {
                "_id": "game5",
                "whitePlayerId": "7",
                "blackPlayerId": "1",
                "result": "draw"
            },
            {
                "_id": "game6",
                "whitePlayerId": "8",
                "blackPlayerId": "1",
                "result": "whiteWins"
            },
            {
                "_id": "game7",
                "whitePlayerId": "9",
                "blackPlayerId": "2",
                "result": "whiteWins"
            },
        ]

        */
        // Group by player ID (handle both white and black roles)
        {
          $facet: {
            // Calculate stats for when users played as white
            whiteStats: [
              { $match: { whitePlayerId: { $in: userIds } } },
              {
                $group: {
                  _id: "$whitePlayerId",
                  wins: {
                    $sum: {
                      $cond: [{ $eq: ["$result", GameResult.whiteWins] }, 1, 0],
                    },
                  },
                  losses: {
                    $sum: {
                      $cond: [{ $eq: ["$result", GameResult.blackWins] }, 1, 0],
                    },
                  },
                  draws: {
                    $sum: {
                      $cond: [{ $eq: ["$result", GameResult.draw] }, 1, 0],
                    },
                  },
                },
              },
            ],
            // Calculate stats for when users played as black
            blackStats: [
              { $match: { blackPlayerId: { $in: userIds } } },
              {
                $group: {
                  _id: "$blackPlayerId",
                  wins: {
                    $sum: {
                      $cond: [{ $eq: ["$result", GameResult.blackWins] }, 1, 0],
                    },
                  },
                  losses: {
                    $sum: {
                      $cond: [{ $eq: ["$result", GameResult.whiteWins] }, 1, 0],
                    },
                  },
                  draws: {
                    $sum: {
                      $cond: [{ $eq: ["$result", GameResult.draw] }, 1, 0],
                    },
                  },
                },
              },
            ],
          },
        },
        /*
        Sample output
        [
            {
            "whiteStats": [
                { "_id": "1", "wins": 1, "losses": 1, "draws": 0 },
                { "_id": "2", "wins": 0, "losses": 0, "draws": 2 }
            ],
            "blackStats": [
                { "_id": "1", "wins": 0, "losses": 1, "draws": 1 },
                { "_id": "2", "wins": 0, "losses": 1, "draws": 0 }
            ]
            }
        ]
        */
        // Combine results into a single array
        {
          $project: {
            allStats: { $concatArrays: ["$whiteStats", "$blackStats"] },
          },
        },
        /*
        Sample output
        [
            {
                "allStats": [
                    { "_id": "1", "wins": 1, "losses": 1, "draws": 0 },
                    { "_id": "2", "wins": 0, "losses": 0, "draws": 2 },
                    { "_id": "1", "wins": 0, "losses": 1, "draws": 1 },
                    { "_id": "2", "wins": 0, "losses": 1, "draws": 0 }
                ]
            }
        ]
        */
        { $unwind: "$allStats" },
        /*
        Sample output
        [
            { "allStats": { "_id": "1", "wins": 1, "losses": 1, "draws": 0 } },
            { "allStats": { "_id": "2", "wins": 0, "losses": 0, "draws": 2 } },
            { "allStats": { "_id": "1", "wins": 0, "losses": 1, "draws": 1 } },
            { "allStats": { "_id": "2", "wins": 0, "losses": 1, "draws": 0 } }
        ]
        */
        // Group again to sum up stats if a user appeared in both whiteStats and blackStats
        {
          $group: {
            _id: "$allStats._id",
            wins: { $sum: "$allStats.wins" },
            losses: { $sum: "$allStats.losses" },
            draws: { $sum: "$allStats.draws" },
          },
        },
        /*
        Sample output
        [
            { "_id": "1", "wins": 1, "losses": 2, "draws": 1 },
            { "_id": "2", "wins": 0, "losses": 1, "draws": 2 }
        ]
        */
      ]);

      // Create a map for easy lookup of stats by userId
      const statsMap = new Map<
        string,
        { wins: number; losses: number; draws: number }
      >();
      gameStats.forEach((stat) => {
        statsMap.set(stat._id, {
          wins: stat.wins,
          losses: stat.losses,
          draws: stat.draws,
        });
      });

      /*
        ["1", { wins: 1, losses: 2, draws: 1 }],
        ["2", { wins: 0, losses: 1, draws: 2 }],
      */

      // Merge user data with game stats
      const leaderboardEntries: LeaderboardEntry[] = users.map(
        (user, index) => {
          const stats = statsMap.get(user.id) || {
            wins: 0,
            losses: 0,
            draws: 0,
          }; 
          // Default to 0 if no stats found
          return {
            id: user.id,
            rank: offset + index + 1, // Calculate rank based on offset and position
            username: user.username,
            elo: user.elo,
            wins: stats.wins,
            losses: stats.losses,
            draws: stats.draws,
          };
        }
      );

      return {
        leaderboard: leaderboardEntries,
        totalRecords,
      };
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      // Consider logging the error using fastify's logger if available
      throw new Error("Failed to fetch leaderboard data.");
    }
  },
};
