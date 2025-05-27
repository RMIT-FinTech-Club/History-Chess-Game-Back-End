import { userProperties } from "./userSchema";

export interface LeaderboardEntry {
  rank: number; // Calculated rank
  id: string;
  username: string;
  elo: number;
  // wins: number;
  // losses: number;
  // draws: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  totalRecords: number;
  currentPage: number;
  totalPages: number;
}

export type SortOption = 'elo_desc' | 'elo_asc' | 'username_desc' | 'username_asc';

// Schema for a single entry in the leaderboard response
const leaderboardEntrySchema = {
  type: "object",
  properties: {
    rank: { type: "integer", description: "User rank based on ELO" },
    id: userProperties.id, 
    username: userProperties.username,
    elo: userProperties.elo,
    // wins: { type: "integer", description: "Total wins" },
    // losses: { type: "integer", description: "Total losses" },
    // draws: { type: "integer", description: "Total draws" },
  },
  required: ["rank", "id", "username", "elo"],
  additionalProperties: false,
};

// Main schema for the GET /leaderboard endpoint
export const getLeaderboardSchema = {
  tags: ["leaderboard"],
  querystring: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 20,
        description: "Number of users per page.",
      },
      page: {
        type: "integer",
        minimum: 1,
        default: 1,
        description: "The page number to retrieve.",
      },
      sort: {
        type: "string",
        enum: ["elo_desc", "elo_asc", "username_desc", "username_asc"],
        default: "elo_desc",
        description: "Sorting option for the leaderboard.",
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      description: "Successful response with leaderboard data.",
      type: "object",
      properties: {
        leaderboard: {
          type: "array",
          items: leaderboardEntrySchema,
        },
        totalRecords: {
          type: "integer",
          description: "Total number of records.",
        },
        currentPage: {
          type: "integer",
          description: "The current page number.",
        },
        totalPages: {
          type: "integer",
          description: "Total number of pages.",
        },
      },
      required: [
        "leaderboard",
        "totalRecords",
        "currentPage",
        "totalPages",
      ],
    },
    400: {
      description: "Bad Request - Invalid query parameters.",
      type: "object",
      properties: {
        error: {
          type: "string",
          example: "Invalid 'limit' or 'page' parameter.",
        },
        statusCode: { type: "integer", example: 400 },
      },
       required: ["error", "statusCode"],
    },
    500: {
      description: "Internal Server Error.",
      type: "object",
      properties: {
        error: {
          type: "string",
          example: "Internal server error.",
        },
        statusCode: { type: "integer", example: 500 },
      },
      required: ["error", "statusCode"],
    },
  },
};
