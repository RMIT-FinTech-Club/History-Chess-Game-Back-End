import mongoose, { Schema, Document } from 'mongoose';

export interface IMarketplaceItem extends Document {
    name: string;
    description: string;
    imageUrl: string;
    rarity: string;
    dynasty: string;
    price: number;
    quantity: number;
    soldCount: number;
    category: string;
    transactionHash?: string;
    isActive: boolean;
    createdAt: Date;
    historicalContext?: any;
}

const MarketplaceItemSchema = new Schema<IMarketplaceItem>({
    name: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    rarity: { type: String, required: true },
    dynasty: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    soldCount: { type: Number, default: 0 },
    category: { type: String, required: true },
    transactionHash: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    historicalContext: { type: Schema.Types.Mixed }
});

export const MarketplaceItem = mongoose.model<IMarketplaceItem>('MarketplaceItem', MarketplaceItemSchema);
