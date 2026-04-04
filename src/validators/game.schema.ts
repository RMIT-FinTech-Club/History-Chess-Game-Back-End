import { z } from 'zod';
import { PlayMode } from '../types/enum';

export const createGameSchema = z.object({
  userId: z.string().uuid(),
  playMode: z.nativeEnum(PlayMode),
  colorPreference: z.enum(['white', 'black', 'random']).default('random'),
});

export const findMatchSchema = z.object({
  userId: z.string().uuid(),
  playMode: z.nativeEnum(PlayMode),
  colorPreference: z.enum(['white', 'black', 'random']).default('random'),
  socketId: z.string().min(1),
});
