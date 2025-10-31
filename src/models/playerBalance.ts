import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayerBalance extends Document {
	userId: string; // References postgres user.id
	balance: string;
	pendingBalance: string;
	version: number; 
	lastUpdated: Date;
	lastSyncedBlock: number;
	pendingTransactions: IPendingTransaction[];
	rewardIds: mongoose.Types.ObjectId[]; // References GameReward._id
	needsSync: boolean;
	syncError?: string // Last sync error if any
	corrections?: IBalanceCorrection[];
	deletedAt?: Date; 
}

export interface IPendingTransaction {
	transactionHash: string;
	amount: string; // reward amount
	type: 'PvP' | 'Bot';
	status: 'pending' | 'confirmed' | 'failed';
	createdAt: Date;
	blockNumber?: number;
}

export interface IBalanceCorrection {
	oldBalance: string; // before correction
	newBalance: string; // after correction
	timestamp: Date;
	blockNumber?: number; // related block if applicable
}

const PendingTransactionSchema = new Schema<IPendingTransaction>({
	transactionHash: { type: String, required: true },
	amount: { type: String, required: true },
	type: { type: String, enum: ['PvP', 'Bot'], required: true },
	status:{
		type: String,
		enum: ['pending', 'confirmed', 'failed'],
		default: 'pending'
	},
	createdAt: { type: Date, default: Date.now },
	blockNumber: { type: Number }
});

const BalanceCorrectionSchema = new Schema<IBalanceCorrection>({
	oldBalance: { type: String, required: true },
	newBalance: { type: String, required: true },
	timestamp: { type: Date, default: Date.now },
	blockNumber: { type: Number }
});

const PlayerBalanceSchema = new Schema<IPlayerBalance>({
	userId: {
		type: String,
		required: true,
		unique: true,
		index: true
	},
	balance: { type: String, default: '0' },
	pendingBalance: { type: String, default: '0' },
	version: { type: Number, default: 0 },
	lastUpdated: { type: Date, default: Date.now, index: true },
	lastSyncedBlock: { type: Number, default: 0 },
	pendingTransactions: [PendingTransactionSchema],
	rewardIds: [{
		type: Schema.Types.ObjectId,
		ref: 'GameReward'
	}],
	needsSync: { type: Boolean, default: false, index: true},
	syncError: { type: String },
	corrections: [BalanceCorrectionSchema],
	deletedAt: { type: Date }
});

PlayerBalanceSchema.pre('save', function(next) {
	this.version += 1;
	this.lastUpdated = new Date();
	next();
});

PlayerBalanceSchema.index({ userId: 1, version: 1 });
PlayerBalanceSchema.index({ needsSync: 1, lastUpdated: 1 });
PlayerBalanceSchema.index({ balance: -1 });
PlayerBalanceSchema.index({ lastUpdated: 1, needsSync: 1 });

export const PlayerBalance = mongoose.model<IPlayerBalance>('PlayerBalance', PlayerBalanceSchema);