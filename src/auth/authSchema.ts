// Schema for authentication API endpoints

import { userResponseSchema } from '../routes/schemas/userSchema';

// Login schema
export const loginSchema = {
    tags: ['auth'],
    body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' }
        },
        additionalProperties: false
    },
    response: {
        200: {
            type: 'object',
            properties: {
                token: { type: 'string' },
                user: userResponseSchema
            }
        },
        401: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        }
    }
};

// Register schema
export const registerSchema = {
    tags: ['auth'],
    body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
            username: { type: 'string', minLength: 3 },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
            walletAddress: { type: 'string', nullable: true }
        },
        additionalProperties: false
    },
    response: {
        201: {
            type: 'object',
            properties: {
                token: { type: 'string' },
                user: userResponseSchema
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

// Logout schema
export const logoutSchema = {
    tags: ['auth'],
    response: {
        200: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        }
    }
};

// Current user profile schema
export const getCurrentUserSchema = {
    tags: ['auth'],
    headers: {
        type: 'object',
        properties: {
            authorization: { type: 'string' }
        },
        required: ['authorization']
    },
    response: {
        200: userResponseSchema,
        401: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        }
    }
};

// Change password schema
export const changePasswordSchema = {
    tags: ['auth'],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        required: ['password'],
        properties: {
            currentPassword: { type: 'string' },
            password: { type: 'string', minLength: 6 }
        },
        additionalProperties: false
    },
    response: {
        200: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        },
        401: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        },
        404: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        }
    }
};