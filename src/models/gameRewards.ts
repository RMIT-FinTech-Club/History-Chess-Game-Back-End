import mongoose, { Schema, Document } from 'mongoose';

export interface IGameReward extends Document {
	gameSessionId: string;
	gameId?: string;
	winnerId: string;
	winnerWallet: string;
	matchType: 'PvP' | 'Bot';
	gameResult: string;

	// Blockchain tracking
	transactionHash?: string;
	rewardAmount: string;
	blockNumber?: number;
	confirmed: boolean; // whether blockchain transaction is confirmed

	gameEndTime: Date; 
	rewardSentAt?: Date; // when transaction was initiated
	confirmedAt?: Date; // when transaction was confirmed
	deletedAt?: Date;
}

const GameRewardSchema = new Schema<IGameReward>({
	gameSessionId: {
		type: String,
		required: true,
		index: true
	},
	gameId: { type: String, index: true },
	winnerId: {
		type: String,
		required: true,
		index: true 
	},
	winnerWallet: {
		type: String,
		required: true,
		index: true
	},
	rewardAmount: { type: String, required: true},
	matchType: {
		type: String,
		enum: ['PvP', 'Bot'],
		required: true
	},
	gameResult: { type: String, required: true },
	transactionHash: {
		type: String,
		unique: true,
		sparse: true, 
		index: true
	},
	blockNumber: { type: Number, index: true },
	confirmed: {
		type: Boolean,
		default: false,
		index: true
	},
	gameEndTime: {
		type: Date,
		required: true,
		index: true
	},
	rewardSentAt: { type: Date },
	confirmedAt: { type: Date },
	deletedAt: { type: Date }
});

GameRewardSchema.index({ winnerId: 1, gameEndTime: -1 });
GameRewardSchema.index({ confirmed: 1, rewardSentAt: 1 });
GameRewardSchema.index({ matchType: 1, gameEndTime: -1 });
GameRewardSchema.index({ gameSessionId: 1 }, { unique: true }); // one reward per game session
GameRewardSchema.index({ deletedAt: 1});

export const GameReward = mongoose.model<IGameReward>('GameReward', GameRewardSchema);
