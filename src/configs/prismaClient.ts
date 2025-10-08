import { PrismaClient } from '@prisma/client';
import { dbConfig } from './db.ts';

export const postgresPrisma = new PrismaClient({
  datasources: { db: { url: dbConfig.neon.url } },
});