// Schema for user API endpoints

export const userProperties = {
  id: { type: 'string', format: 'uuid' },
  username: { type: 'string' },
  email: { type: 'string', format: 'email' },
  walletAddress: { type: 'string', nullable: true },
  avatarUrl: { type: 'string', nullable: true },
  language: { type: 'string', enum: ['en', 'vi'] },
  elo: { type: 'integer' },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
};

export const userResponseSchema = {
  type: 'object',
  properties: userProperties,
  additionalProperties: false,
};

export const userArrayResponseSchema = {
  type: 'array',
  items: userResponseSchema,
};

export const createUserSchema = {
  tags: ['user'],
  body: {
    type: 'object',
    required: ['username', 'email', 'password'],
    properties: {
      username: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9]+$' },
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 9 },
      walletAddress: { type: 'string', nullable: true },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        data: userResponseSchema,
      },
    },
    409: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

export const getUserSchema = {
  tags: ['user'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        data: userResponseSchema,
      },
    },
    404: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

export const updateProfileSchema = {
  tags: ['user', 'profile'],
  summary: 'Update user profile',
  description: 'Updates the user profile information including username',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        minLength: 3,
        maxLength: 50,
        pattern: '^[a-zA-Z0-9]+$',
        description: 'New username',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        data: userResponseSchema,
      },
    },
    404: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    409: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

export const updateAuthenticatedProfileSchema = {
  tags: ['user', 'profile'],
  summary: 'Update authenticated user profile',
  description: 'Updates the authenticated user profile information (no user ID required)',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        minLength: 3,
        maxLength: 50,
        pattern: '^[a-zA-Z0-9]+$',
        description: 'New username (optional)',
      },
      avatarUrl: {
        type: 'string',
        nullable: true,
        description: 'New avatar URL (optional)',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        data: userResponseSchema,
      },
    },
    401: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    404: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    409: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

export const deleteUserSchema = {
  tags: ['user'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    404: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

export const getAllUsersSchema = {
  tags: ['user'],
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, default: 10 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        users: userArrayResponseSchema,
        total: { type: 'integer' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
        token: { type: 'string' },
      },
    },
  },
};

export const uploadAvatarSchema = {
  tags: ['user', 'profile'],
  summary: 'Upload user avatar',
  description: 'Upload a profile picture for the user',
  consumes: ['multipart/form-data'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        avatarUrl: { type: 'string' },
        token: { type: 'string' },
        user: userResponseSchema,
      },
    },
    400: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    404: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  },
};