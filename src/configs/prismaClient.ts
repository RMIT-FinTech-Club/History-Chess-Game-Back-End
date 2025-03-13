import { PrismaClient as PostgresPrisma } from "@prisma/client";
import { PrismaClient as MongoPrisma } from "@prisma/client";
import { dbConfig } from "./db";

const fullMongoUrl = `${dbConfig.mongodb.url}${dbConfig.mongodb.database}`;

// Initialize Prisma Clients
export const postgresPrisma = new PostgresPrisma({
  datasources: { db: { url: dbConfig.neon.url } },
});

export const mongoPrisma = new MongoPrisma({
  datasources: { db: { url: fullMongoUrl } },
});