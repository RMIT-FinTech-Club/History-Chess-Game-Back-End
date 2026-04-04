import { z } from 'zod';
import 'dotenv/config';
import dns from 'node:dns';

// Fix for Node.js SRV lookup issues on some machines (e.g. MongoDB Atlas)
dns.setServers(['8.8.8.8', '8.8.4.4']);

const configSchema = z.object({
  port: z.coerce.number().default(8080),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  jwt: z.object({
    secret: z.string().default('your-secret-key'),
  }),
  db: z.object({
    mongodb: z.object({
      uri: z.string(),
      dbName: z.string().default('ftc_history_chess_game'),
    }),
    neon: z.object({
      url: z.string(),
    }),
  }),
  google: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    emailUser: z.string().optional(),
    emailPass: z.string().optional(),
  }),
  aws: z.object({
    region: z.string().default('ap-southeast-2'),
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    s3BucketName: z.string(),
  }),
  rabbitmq: z.object({
    url: z.string().default('amqp://guest:guest@localhost:5672'),
    queues: z.object({
      rewardQueue: z.string().default('reward_queue'),
      rewardDLQ: z.string().default('reward_dlq'),
      stockfishQueue: z.string().default('stockfish_queue'),
    }),
    prefetchCount: z.coerce.number().default(1),
  }),
  blockchain: z.object({
    rpcUrl: z.string().default('http://localhost:8545'),
    contractAddress: z.string().optional(),
    deployerPrivateKey: z.string().optional(),
  }),
  app: z.object({
    uiUrl: z.string().default('http://localhost:3000'),
    backendUrl: z.string().default('http://localhost:8080'),
  }),
});

export type Config = z.infer<typeof configSchema>;

const env = process.env;

const rawConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  jwt: {
    secret: env.JWT_SECRET,
  },
  db: {
    mongodb: {
      uri: env.MONGODB_URI || env.MONGODB_URL,
      dbName: env.MONGODB_DB,
    },
    neon: {
      url: env.NEON_URL,
    },
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    emailUser: env.EMAIL_USER,
    emailPass: env.EMAIL_PASS,
  },
  aws: {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    s3BucketName: env.AWS_S3_BUCKET_NAME,
  },
  rabbitmq: {
    url: env.RABBITMQ_URL,
    queues: {
      rewardQueue: env.RABBITMQ_REWARD_QUEUE,
      rewardDLQ: env.RABBITMQ_REWARD_DLQ,
      stockfishQueue: env.RABBITMQ_STOCKFISH_QUEUE,
    },
    prefetchCount: env.RABBITMQ_PREFETCH_COUNT,
  },
  blockchain: {
    rpcUrl: env.RPC_URL || env.ETHEREUM_ENDPOINT,
    contractAddress: env.GAME_COIN_CONTRACT_ADDRESS,
    deployerPrivateKey: env.DEPLOYER_PRIVATE_KEY,
  },
  app: {
    uiUrl: env.NODE_ENV === 'production' ? (env.UI_PROD || env.UI_LOCALHOST) : (env.UI_LOCALHOST || env.UI_PROD),
    backendUrl: env.NODE_ENV === 'production' ? (env.PROD || env.LOCALHOST) : (env.LOCALHOST || env.PROD),
  },
};

const parsed = configSchema.safeParse(rawConfig);

if (!parsed.success) {
  console.error('❌ Invalid configuration:', parsed.error.format());
  throw new Error('Invalid configuration');
}

export const config = parsed.data;
