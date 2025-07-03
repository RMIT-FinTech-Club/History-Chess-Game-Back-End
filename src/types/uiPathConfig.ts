// Define an interface for environment variables (for better type safety)
interface EnvConfig {
    PRODUCTION: string;
    UI_LOCALHOST: string;
    UI_PROD: string;
}

// Access environment variables with type safety
const env: EnvConfig = {
    PRODUCTION: process.env.PRODUCTION || '1',
    UI_LOCALHOST: process.env.UI_LOCALHOST || 'http://localhost:3000',
    UI_PROD: process.env.UI_PROD || 'https://history-chess-game-front-end.vercel.app',
};

const uiBasePath = env.PRODUCTION !== '0' ? `${env.UI_PROD}` : `${env.UI_LOCALHOST}`;

export default uiBasePath;