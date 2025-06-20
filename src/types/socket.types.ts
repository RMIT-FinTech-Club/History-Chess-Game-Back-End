import { Socket } from 'socket.io';

export interface CustomSocket extends Socket {
    data: {
        userId?: string;
        gameId?: string;
    };
} 