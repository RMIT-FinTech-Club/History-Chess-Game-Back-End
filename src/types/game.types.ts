import { Socket } from 'socket.io';
import { Chess } from 'chess.js';
import { GameStatus, PlayMode } from './enum';

export interface InMemoryGameSession {
    gameId: string;
    players: string[];
    playerSockets: Socket[];
    chess: Chess;
    status: GameStatus;
    whiteTimeLeft: number;
    blackTimeLeft: number;
    gameState: string;
    timer?: NodeJS.Timeout;
}

export interface WaitingPlayer {
    socket: Socket;
    elo: number;
}

export interface QueuedPlayer {
    userId: string;
    socketId: string;
    playMode: PlayMode;
    colorChoice: 'white' | 'black' | 'random';
    elo: number;
    timestamp: number;
}

export interface GameHistoryItem {
    opponentName: string | null;
    gameMode: string;
    totalTime: number;
    result: 'Victory' | 'Defeat' | 'Draw';
}