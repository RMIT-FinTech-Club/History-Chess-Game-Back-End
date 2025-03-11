import { Socket, Server as SocketIOServer } from 'socket.io'
import * as GameServices from '../services/game.service';

export const handleJoinGame = (socket: Socket, io: SocketIOServer, playerElo: number): void => {
    GameServices.joinGame(socket, io, playerElo);
}

export const handleDisconnect = (socket: Socket, reason: string): void => {
    GameServices.handleDisconnect(socket, reason);
}