import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayerBalance extends Document {
	userId: string;
	walletAddress: string;
	balance: string;
	pendingBalance: string;
	version: number; 
	lastUpdated: Date;
	lastSyncedBlock: number;
	pendingTransactions: IPendingTransaction[];
	needsSync: boolean;
	syncError?: string // Last sync error if any
	corrections?: IBalanceCorrection[];
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
		index: true // this is a primary looup by userId for the UI
	},
	walletAddress: {
		type: String,
		required: true,
		unique: true,
		index: true // this is a lookup by wallet for blockchain events
	}, 
	balance: { type: String, default: '0' },
	pendingBalance: { type: String, default: '0' },
	lastUpdated: { type: Date, default: Date.now, index: true },
	lastSyncedBlock: { type: Number, default: 0 },
	pendingTransactions: [PendingTransactionSchema],
	needsSync: { type: Boolean, default: false, index: true},
	syncError: { type: String },
	corrections: [BalanceCorrectionSchema]
});

// Indexes for fast queries
PlayerBalanceSchema.index({ walletAddress: 1, version: 1 }); 
PlayerBalanceSchema.index({ needsSync: 1, lastUpdated: 1 })
PlayerBalanceSchema.index({ balance: -1 });
PlayerBalanceSchema.index({ lastUpdated: 1, needsSync: 1 });

export const PlayerBalance = mongoose.model<IPlayerBalance>('PlayerBalance', PlayerBalanceSchema);