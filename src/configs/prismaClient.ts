import { PrismaClient } from '@prisma/client';
import { dbConfig } from './db';
import * as dotenv from 'dotenv';

dotenv.config();

export const postgresPrisma = new PrismaClient({
  datasources: { db: { url: dbConfig.neon.url } },
});