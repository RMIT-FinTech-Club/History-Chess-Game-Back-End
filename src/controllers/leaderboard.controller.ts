import { FastifyRequest, FastifyReply } from "fastify";
import { getLeaderboardService } from "../services/leaderboard.service";
import { LeaderboardResponse, SortOption } from "../routes/schemas/leaderboardSchema";
import validator from "validator";
interface GetLeaderboardQuery {
  limit: number;
  page: number;
  sort: SortOption;
}

export const leaderboardController = {
  async getLeaderboard(
    request: FastifyRequest<{ Querystring: GetLeaderboardQuery }>,
    reply: FastifyReply
  ) {
    try {
      let { limit, page, sort } = request.query;
      request.log.info("Received query params: %o", { limit, page, sort });
      // Validate and sanitize pageSize parameter
      const limitStr = String(limit);
      request.log.info("Validating pageSize: %s", limitStr); 
      if (!validator.isInt(limitStr, { min: 1, max: 100 })) {
        return reply.code(400).send({
          message:
            "Invalid pageSize parameter. Must be an integer between 1 and 100.",
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

      const validSortOptions: SortOption[] = ['elo_desc', 'elo_asc', 'username_desc', 'username_asc'];

      if (!validSortOptions.includes(sort)) {
        sort = 'elo_desc'; 
      }
      
      const [sortBy, sortDir] = sort.split('_');

      // Convert to integers after validation
      const sanitizedLimit = validator.toInt(limitStr);
      const sanitizedPage = validator.toInt(pageStr);

      // Calculate offset based on current page and pageSize
      const offset = (sanitizedPage - 1) * sanitizedLimit;

      const { leaderboard, totalRecords } =
        await getLeaderboardService.fetchLeaderboard(
          request.server.prisma,
          sanitizedLimit,
          offset,
          sortBy as 'elo' | 'username',
          sortDir as 'asc' | 'desc'
        );

      const totalPages = Math.ceil(totalRecords / sanitizedLimit);

      const response: LeaderboardResponse = {
        leaderboard,
        totalRecords,
        currentPage: sanitizedPage,
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