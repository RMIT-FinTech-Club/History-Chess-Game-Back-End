// Define an interface for environment variables (for better type safety)
interface EnvConfig {
    PRODUCTION: string;
    LOCALHOST: string;
    PROD: string;
}

// Access environment variables with type safety
const env: EnvConfig = {
    PRODUCTION: process.env.PRODUCTION || '0',
    LOCALHOST: process.env.LOCALHOST || 'http://localhost:8080',
    PROD: process.env.PROD || 'https://history-chess-game-back-end.vercel.app',
};

const basePath = env.PRODUCTION !== '0' ? `${env.PROD}` : `${env.LOCALHOST}`;

export default basePath;