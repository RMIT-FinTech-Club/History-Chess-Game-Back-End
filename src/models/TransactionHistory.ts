import mongoose, { Schema, Document } from 'mongoose';

export interface ITransactionHistory extends Document {
    userId: string;
    type: string;
    amount: number;
    currency: string;
    description: string;
    transactionHash?: string;
    status: string; // 'pending' | 'confirmed' | 'failed'
    metadata?: any;
    createdAt: Date;
    explorerUrl?: string;
}

const TransactionHistorySchema = new Schema<ITransactionHistory>({
    userId: { type: String, required: true },
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    description: { type: String, required: true },
    transactionHash: { type: String },
    status: { type: String, required: true, default: 'pending' },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    explorerUrl: { type: String }
});

export const TransactionHistory = mongoose.model<ITransactionHistory>('TransactionHistory', TransactionHistorySchema);
