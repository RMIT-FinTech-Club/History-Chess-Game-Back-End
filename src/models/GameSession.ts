import mongoose, { Schema } from 'mongoose';
import { GameResult, PlayMode, GameStatus } from '../types/enum';

export interface IGameSession {
    gameId: string;
    whitePlayerId: string | null;
    blackPlayerId: string | null;
    startTime: Date;
    endTime: Date | null;
    result: GameResult;
    winner: string | null; 
    status: GameStatus;
    playMode: PlayMode;
    timeLimit: number;
    moves: IMove[];
    challengedOpponentId: string | null;
    finalFen: string | null;
    whiteTimeLeft?: number;
    blackTimeLeft?: number;
}

export interface IMove {
    moveNumber: number;
    move: string;
    color: 'white' | 'black';
    playerId: string;
    timestamp: Date;
    duration: number; // Duration in seconds
}

const MoveSchema = new Schema<IMove>({
    moveNumber: { type: Number, required: true },
    move: { type: String, required: true },
    color: { type: String, required: true, enum: ['white', 'black'] },
    playerId: { type: String, required: true },
    timestamp: { type: Date, required: true },
    duration: { type: Number, required: true },
});

const GameSessionSchema = new Schema<IGameSession>({
    gameId: { type: String, required: true, unique: true },
    whitePlayerId: { type: String, default: null },
    blackPlayerId: { type: String, default: null },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date, default: null },
    result: { type: String, default: '*', enum: ['*', '1-0', '0-1', '1/2-1/2'] },
    winner: { type: String, default: null }, 
    status: { type: String, required: true, enum: ['waiting', 'pending', 'active', 'finished'], default: 'waiting' },
    playMode: { type: String, required: true, enum: ['bullet', 'blitz', 'rapid'] },
    timeLimit: { type: Number, required: true }, // in milliseconds
    moves: [MoveSchema],
    challengedOpponentId: { type: String, default: null },
    finalFen: { type: String, default: null },
    whiteTimeLeft: { type: Number },
    blackTimeLeft: { type: Number }
});

export const GameSession = mongoose.model('GameSession', GameSessionSchema);