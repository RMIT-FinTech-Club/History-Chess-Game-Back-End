import { FastifyRequest, FastifyReply } from "fastify";
import { getLeaderboardService } from "../services/leaderboard.service";
import { LeaderboardResponse } from "../routes/schemas/leaderboardSchema";
import validator from "validator";

interface GetLeaderboardQuery {
  limit: number;
  page: number;
}

export const leaderboardController = {
  async getLeaderboard(
    request: FastifyRequest<{ Querystring: GetLeaderboardQuery }>,
    reply: FastifyReply
  ) {
    try {
      let { limit, page } = request.query;

      const limitStr = String(limit);

      if (!validator.isInt(limitStr, { min: 1, max: 100 })) {
        return reply.code(400).send({
          message:
            "Invalid limit parameter. Must be an integer between 1 and 100.",
        });
      }

      // Validate and sanitize page parameter
      const pageStr = String(page);
      request.log.info("Validating page: %s", pageStr); 
      if (!validator.isInt(pageStr, { min: 1 })) {
        return reply.code(400).send({
          message: "Invalid page parameter. Must be a positive integer.",
        });
      }

      // Convert to integers after validation
      const validatedLimit = validator.toInt(limitStr);
      const validatedPage = validator.toInt(pageStr);

      // Calculate offset based on current page and limit
      const offset = (validatedPage - 1) * validatedLimit;

      const { leaderboard, totalRecords } =
        await getLeaderboardService.fetchLeaderboard(
          request.server.prisma,
          validatedLimit,
          offset
        );

      const totalPages = Math.ceil(totalRecords / validatedLimit);

      const response: LeaderboardResponse = {
        leaderboard,
        totalRecords,
        currentPage: validatedPage,
        totalPages
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error("Leaderboard Controller Error:", error);
      if (
        error instanceof Error &&
        error.message === "Failed to fetch leaderboard data."
      ) {
        return reply
          .code(500)
          .send({ message: "Failed to retrieve leaderboard data." });
      }
      return reply
        .code(500)
        .send({ message: "Internal server error occurred." });
    }
  },
};