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
    analysisCompleted?: boolean;
    analysisDate?: Date;
}

export interface IMove {
    moveNumber: number;
    move: string;
    fen?: string;
    evaluation: number;
    bestmove: string;
    mate?: number;
    continuation?: string; 
    color: 'white' | 'black';
    playerId: string;
}

const MoveSchema = new Schema<IMove>({
    moveNumber: { type: Number, required: true },
    move: { type: String, required: true },
    fen: { type: String, required: false },
    evaluation: { type: Number, required: true },
    bestmove: { type: String, required: true },
    mate: { type: Number, required: false, default: null },
    continuation: { type: String, required: false },
    color: { type: String, required: true, enum: ['white', 'black'] },
    playerId: { type: String, required: true }
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
    timeLimit: { type: Number, required: true },
    moves: [MoveSchema],
    challengedOpponentId: { type: String, default: null },
    finalFen: { type: String, default: null },
    whiteTimeLeft: { type: Number },
    blackTimeLeft: { type: Number },
    analysisCompleted: { type: Boolean, default: false },
    analysisDate: { type: Date }
});

export const GameSession = mongoose.model('GameSession', GameSessionSchema);