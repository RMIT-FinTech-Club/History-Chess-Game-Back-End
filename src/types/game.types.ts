import { Socket } from 'socket.io';
import { Chess } from 'chess.js';
import { GameStatus } from './enum';

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
