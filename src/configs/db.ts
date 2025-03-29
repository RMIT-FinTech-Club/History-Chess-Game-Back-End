import * as dotenv from 'dotenv';

dotenv.config();

export const dbConfig = {
  neon: {
    url: process.env.NEON_URL || 'postgresql://neondb_owner:npg_eQYSf2pm3NjI@ep-dry-pine-a1k710k2-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  },
};