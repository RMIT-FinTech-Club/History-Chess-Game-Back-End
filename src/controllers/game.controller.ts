import { Socket, Server as SocketIOServer } from 'socket.io'
import * as GameServices from '../services/game.service';

export const handleJoinGame = (socket: Socket, io: SocketIOServer): void => {
    // Listen for joinGame event with ELO data
    socket.on('joinGame', (data: { elo: number }) => {
        const playerElo = data.elo || 1200; // Default to 1200 if no ELO provided
        GameServices.joinGame(socket, io, playerElo);
    });
}

export const handleDisconnect = (socket: Socket, reason: string): void => {
    GameServices.handleDisconnect(socket, reason);
}