import { PrismaClient } from "../../generated/client";
import { dbConfig } from "./db";

export const mongoPrisma = new PrismaClient({
  datasources: { db: { url: dbConfig.mongodb.url } },
});
