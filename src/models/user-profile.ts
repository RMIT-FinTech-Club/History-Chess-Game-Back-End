import { FastifySchema } from "fastify";

// Interface for the user profile
export interface UserProfile {
    id: string;
    username: string;
    email: string;
    elo: number;
    walletAddress?: string;
    games?: any[]; // You might want to create a more specific type for games
    ownedNFTs?: any[]; // You might want to create a more specific type for NFTs
    createdAt: Date;
    updatedAt: Date;
}

// Interface for profile update
export interface UserProfileUpdate {
    username?: string;
    email?: string;
    walletAddress?: string;
}

// JSON schema for Swagger
export const userProfileSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        elo: { type: 'integer' },
        walletAddress: { type: 'string' },
        games: { 
            type: 'array', 
            items: {
                type: 'object',
                // Define properties specific to your games model
            } 
        },
        ownedNFTs: {
            type: 'array',
            items: {
                type: 'object',
                // Define properties specific to your NFTs model
            }
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'username', 'email', 'elo', 'createdAt', 'updatedAt']
};

// Error schema
export const errorSchema = {
    type: 'object',
    properties: {
        code: { type: 'integer' },
        message: { type: 'string' }
    }
};