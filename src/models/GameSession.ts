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
    whiteAccuracyPoint: number | 0;
    blackAccuracyPoint: number | 0;
    analysisCompleted?: boolean;
    analysisDate?: Date;
}

export interface IMove {
    moveNumber: number;
    move: string;
    fen: string;
    evaluation: number | null;
    bestmove: string;
    mate: number | null;
    continuation?: string;
    playerColor: 'w' | 'b';
    playerId: string;
    initialEvalCP: number,
    moveEvalCP: number, 
    initialExpectedPoints: number,
    moveExpectedPoints: number, 
    bestMoveExpectedPoints: number,
    expectedPointsLost: number, 
    classification?: string,
    error?: string
}

const MoveSchema = new Schema<IMove>({
    moveNumber: { type: Number, required: true },
    move: { type: String, required: true },
    fen: { type: String, required: false },
    evaluation: { type: Number, required: true },
    bestmove: { type: String, required: true },
    mate: { type: Number, required: false, default: null },
    continuation: { type: String, required: false },
    playerColor: { type: String, required: true, enum: ['w', 'b'] },
    playerId: { type: String, required: true },
    initialEvalCP: { type: Number, required: true },
    moveEvalCP: { type: Number, required: true }, 
    initialExpectedPoints: { type: Number, required: true },
    moveExpectedPoints: { type: Number, required: true }, 
    bestMoveExpectedPoints: { type: Number, required: true },
    expectedPointsLost: { type: Number, required: true }, 
    classification: { type: String, required: false },
    error: { type: String, required: false }
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
    whiteAccuracyPoint: { type: Number, default: 0 },
    blackAccuracyPoint: { type: Number, default: 0 },
    analysisCompleted: { type: Boolean, default: false },
    analysisDate: { type: Date }
});

export const GameSession = mongoose.model('GameSession', GameSessionSchema);