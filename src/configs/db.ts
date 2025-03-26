import * as dotenv from 'dotenv';

dotenv.config();

export interface DBConfig {
  neon: { url: string };
  mongo: { url: string; dbName: string };
}

export const dbConfig: DBConfig = {
  neon: {
    url: process.env.NEON_URL || 'postgresql://user:password@localhost:5432/history_chess',
  },
  mongo: {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/',
    dbName: process.env.MONGODB_DB || 'ftc_history_chess_game',
  },
};