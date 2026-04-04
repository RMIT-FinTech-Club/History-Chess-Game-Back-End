import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().optional(),
  token: z.string().optional(),
});

export const signupSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  verificationCode: z.string().length(6),
});

export const updateProfileSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});
