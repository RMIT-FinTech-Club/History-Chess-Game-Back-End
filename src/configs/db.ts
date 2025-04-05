import * as dotenv from "dotenv";

dotenv.config();

export interface DBConfig {
    mongodb: {
        url: string;
        database: string;
    };
    neon: {
        url: string;
    };
}
// Config database connection
export const dbConfig: DBConfig = {
    mongodb: {
        url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
        database: process.env.MONGODB_DB || 'ftc_history_chess_game'
    },
    neon: {
        url: process.env.NEON_URL || 'postgresql://user:password@localhost:5432/dbname'
    }
};

export const fullMongoUrl = `${dbConfig.mongodb.url}${dbConfig.mongodb.database}`;