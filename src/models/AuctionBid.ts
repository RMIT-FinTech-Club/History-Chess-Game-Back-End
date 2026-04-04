import mongoose, { Schema, Document } from 'mongoose';

export interface IAuctionBid extends Document {
    listingId: mongoose.Types.ObjectId | string;
    bidderId: string;
    amount: number;
    createdAt: Date;
}

const AuctionBidSchema = new Schema<IAuctionBid>({
    listingId: { type: Schema.Types.ObjectId, ref: 'MarketplaceListing', required: true },
    bidderId: { type: String, required: true },
    amount: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

export const AuctionBid = mongoose.model<IAuctionBid>('AuctionBid', AuctionBidSchema);
