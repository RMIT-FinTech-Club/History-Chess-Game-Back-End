import mongoose, { Schema, Document } from 'mongoose';

export interface IAchievementProgress extends Document {
    userId: string;
    achievementId: string;
    currentProgress: number;
    maxProgress: number;
    isUnlocked: boolean;
    updatedAt: Date;
}

const AchievementProgressSchema = new Schema<IAchievementProgress>({
    userId: { type: String, required: true },
    achievementId: { type: String, required: true },
    currentProgress: { type: Number, required: true, default: 0 },
    maxProgress: { type: Number, required: true },
    isUnlocked: { type: Boolean, required: true, default: false },
    updatedAt: { type: Date, default: Date.now }
});

// Create index for fast lookups
AchievementProgressSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export const AchievementProgress = mongoose.model<IAchievementProgress>('AchievementProgress', AchievementProgressSchema);
