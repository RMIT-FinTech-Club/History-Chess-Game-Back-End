import { Prisma } from '@prisma/client';
import { Prisma } from '@prisma/client';

// Interface for the user profile
export interface UserProfile extends Prisma.usersGetPayload<{
    include: { games: true; ownedNFTs: true };
}>{
    _marker?: never;
}

// Interface for profile update
export interface UserProfileUpdate {
    username?: string;
    email?: string;
    walletAddress?: string;
    password?: string;
    language?: string;
    avatarUrl?: string | null;
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
            } 
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'username', 'email', 'elo', 'createdAt', 'updatedAt']
};

// Schema for profile update requests
export const profileUpdateSchema = {
    tags: ['user'],
    summary: 'Update user profile',
    description: 'Updates the user profile information including username, email, password, and wallet address',
    body: {
        type: 'object',
        properties: {
            username: {
                type: 'string',
                minLength: 3,
                description: 'New username (optional)'
            },
            email: {
                type: 'string',
                format: 'email',
                description: 'New email address (optional)'
            },
            password: {
                type: 'string',
                minLength: 6,
                description: 'New password (optional)'
            },
            walletAddress: {
                type: 'string',
                nullable: true,
                description: 'New wallet address (optional)'
            }
        },
        additionalProperties: false
    },
    response: {
        200: userProfileSchema,
        404: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        },
        409: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        }
    }
};

// Error schema
export const errorSchema = {
    type: 'object',
    properties: {
        code: { type: 'integer' },
        message: { type: 'string' }
    }
};