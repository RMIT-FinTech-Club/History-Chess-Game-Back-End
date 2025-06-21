export interface StockfishResponse {
    success: boolean;
    evaluation: number;
    mate: number | null;
    bestmove: string | null;
    continuation: string | null;
    error?: string;
}   

// export interface MoveAnalysis {
//     moveNumber: number;
//     move: string; // The SAN of the move
//     fen: string; // FEN *after* this move was made
//     evaluation: number; // Raw eval from Stockfish for the FEN *after* this move
//     bestmove: string;
//     mate: number | null;
//     continuation: string;

//     // New fields for classification from StockfishService
//     initialEvalCP: number; // CP before the move
//     moveEvalCP: number;    // CP after the move
//     initialExpectedPoints: number; // Expected Points before the move (player's perspective)
//     moveExpectedPoints: number;    // Expected Points after the move (player's perspective)
//     bestMoveExpectedPoints: number; // Expected Points if best move was played (player's perspective)
//     expectedPointsLost: number;    // (initialExpectedPoints - moveExpectedPoints)
//     classification: string;        // "Best", "Blunder", "Brilliant", etc.
//     playerColor: 'w' | 'b'; // Who made the move
//     error?: string; // Optional field for analysis errors
// }
