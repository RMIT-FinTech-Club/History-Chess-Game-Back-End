// Schema for user API endpoints

// Based properties for a user object
export const userProperties = {
    id: { type: 'string', format: 'uuid' },
    username: { type: 'string' },
    email: { type: 'string', format: 'email' },
    walletAddress: { type: 'string', nullable: true },
    elo: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
};

export const userResponseSchema = {
    type: 'object',
    properties: userProperties,
    additionalProperties: false
};

export const userArrayResponseSchema = {
    type: 'array',
    items: userResponseSchema
};

export const createUserSchema = {
    tags: ['user'],
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
        201: userResponseSchema
    }
};

export const getUserSchema = {
    tags: ['user'],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'string', format: 'uuid' }
        }
    },
    response: {
        200: userResponseSchema,
        404: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        }
    }
};

export const updateProfileSchema = {
    tags: ['user', 'profile'],
    summary: 'Update user profile',
    description: 'Allows users to update their own profile information',
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        properties: {
            username: {
                type: 'string',
                minLength: 3,
                description: 'Update username'
            },
            email: {
                type: 'string',
                format: 'email',
                description: 'Update email address'
            },
            password: {
                type: 'string',
                minLength: 6,
                description: 'Update password'
            },
            walletAddress: {
                type: 'string',
                nullable: true,
                description: 'Update wallet address'
            }
        },
        additionalProperties: false
    },
    response: {
        200: userResponseSchema,
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

export const updateUserSchema = {
    tags: ['user'],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        properties: {
            username: { type: 'string', minLength: 3 },
            email: { type: 'string', format: 'email' },
            walletAddress: { type: 'string', nullable: true },
            password: { type: 'string', minLength: 6 }
        },
        additionalProperties: false
    },
    response: {
        200: userResponseSchema,
        404: {
            type: 'object',
            properties: {
                message: { type: 'string' }
            }
        }
    }
};

export const deleteUserSchema = {
    tags: ['user'],
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'string', format: 'uuid' }
        }
    },
    response: {
        200: {
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

export const getAllUsersSchema = {
    tags: ['user'],
    querystring: {
        type: 'object',
        properties: {
            limit: { type: 'integer', minimum: 1, default: 10 },
            offset: { type: 'integer', minimum: 0, default: 0 }
        },
        additionalProperties: false
    },
    response: {
        200: {
            type: 'object',
            properties: {
                users: userArrayResponseSchema,
                total: { type: 'integer' },
                limit: { type: 'integer' },
                offset: { type: 'integer' }
            }
        }
    }
};