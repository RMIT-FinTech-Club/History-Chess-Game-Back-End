export const GameStatus = {
    waiting: 'waiting',
    pending: 'pending',
    active: 'active',
    finished: 'finished',
    paused: 'paused'
};

export type GameStatus = typeof GameStatus[keyof typeof GameStatus];

export const PlayMode = {
    bullet: 'bullet',
    blitz: 'blitz',
    rapid: 'rapid'
};

export type PlayMode = typeof PlayMode[keyof typeof PlayMode];

export const GameResult = {
    inProgress: '*',
    whiteWins: '1-0',
    blackWins: '0-1',
    draw: '1/2-1/2'
};

export type GameResult = typeof GameResult[keyof typeof GameResult];