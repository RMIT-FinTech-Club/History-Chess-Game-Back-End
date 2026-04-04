import mongoose, { Schema, Document } from 'mongoose';

export interface IMarketplaceListing extends Document {
    nftId: string;
    sellerId: string;
    listingType: string; // 'FIXED_PRICE' | 'AUCTION'
    price: number;
    currentBid?: number;
    highestBidderId?: string;
    status: string; // 'OPEN' | 'SOLD' | 'CANCELLED' | 'EXPIRED' | 'ENDED'
    startTime: Date;
    endTime?: Date;
    nftDetails?: any;
    transactionHash?: string;
}

const MarketplaceListingSchema = new Schema<IMarketplaceListing>({
    nftId: { type: String, required: true },
    sellerId: { type: String, required: true },
    listingType: { type: String, required: true, default: 'AUCTION' },
    price: { type: Number, required: true },
    currentBid: { type: Number },
    highestBidderId: { type: String },
    status: { type: String, required: true, default: 'OPEN' },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date },
    nftDetails: { type: Schema.Types.Mixed },
    transactionHash: { type: String }
});

export const MarketplaceListing = mongoose.model<IMarketplaceListing>('MarketplaceListing', MarketplaceListingSchema);
