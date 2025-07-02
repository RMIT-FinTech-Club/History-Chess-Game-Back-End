import axios, { AxiosInstance } from 'axios';
import { StockfishResponse } from '../types/stockfish.types';
import { Chess, Color, Move, PieceSymbol, Square } from 'chess.js';
import { IMove } from '../models/GameSession';

export class StockfishService {
    // --- Configurations ---
    private readonly API_URL = 'https://stockfish.online/api/s/v2.php';
    private readonly TIMEOUT = 8000;
    private readonly STOCKFISH_DEPTH = 15;
    private readonly CENTIPAWN_TO_PROB_FACTOR = 400; // A scaling factor used to convert centipawns to win probability. This is tunable.
    private readonly RATE_LIMIT_DELAY = 200;
    private readonly MAX_AVG_EXPECTED_POINTS_LOSS_FOR_0_ACCURACY = 0.25;
    private readonly BASE_ACCURACY_BONUS = 5;
    private axiosInstance: AxiosInstance;

    private lastRequestTime = 0;

    constructor() {
        this.axiosInstance = axios.create({
            baseURL: this.API_URL,
            timeout: this.TIMEOUT,
        });
    }

    private async enforceRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
            const delay = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
            console.log(`Rate limiting: Delaying for ${delay}ms to respect API limits.`);
            await new Promise(resolve => setTimeout(resolve, delay)); // Pause execution
        }
        this.lastRequestTime = Date.now(); // Update last request time
    }

    // Converts Stockfish evaluation data (numerical value and type) to centipawns.
    private centipawnsToExpectedPoints(centipawns: number): number {
        return 1 / (1 + Math.exp(-centipawns / this.CENTIPAWN_TO_PROB_FACTOR));
    };

    private parseStockfishEval(val: number | null, type: 'eval' | 'mate'): number {
        if (val === null) {
            // Default to neutral (0 CP) if evaluation or mate information is null
            return 0;
        }
        if (type === 'mate') {
            return val > 0 ? 100000 - val : -100000 - val;
        } else {
            return val * 100;
        }
    }

    private getMaterialValue(
        board: ({
            square: Square;
            type: PieceSymbol;
            color: Color;
        } | null)[][],
        color: 'w' | 'b'
    ): number {
        let value = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.color === color) {
                    switch (piece.type) {
                        case 'p': value += 1; break;
                        case 'n': value += 3; break;
                        case 'b': value += 3; break;
                        case 'r': value += 5; break;
                        case 'q': value += 9; break;
                    }
                }
            }
        }
        return value;
    }

    private classifyMove(params: {
        initialExpectedPoints: number;
        moveExpectedPoints: number;
        bestMoveExpectedPoints: number;
        boardBeforeMove: Chess;
        boardAfterMove: Chess; // Need boardAfterMove for checkmate check
        playerColor: 'w' | 'b';
    }): string {
        const {
            initialExpectedPoints,
            moveExpectedPoints,
            bestMoveExpectedPoints,
            boardBeforeMove,
            boardAfterMove,
            playerColor
        } = params;

        // Check for checkmate immediately *after* the move.
        if (boardAfterMove.isCheckmate()) {
            return "Checkmate"; // Special classification for delivering checkmate
        }

        const expectedPointsLost = initialExpectedPoints - moveExpectedPoints;

        let classification: string = "Good"; // Default classification

        // Prioritize "Best" if move is virtually identical to engine's best
        const diffFromBestMove = Math.abs(moveExpectedPoints - bestMoveExpectedPoints);

        if (diffFromBestMove <= 0.005) { // Very small difference, virtually identical to best
            classification = "Best";
        } else if (diffFromBestMove <= 0.015) { // Slightly larger difference but still excellent
            classification = "Excellent";
        } else if (expectedPointsLost <= 0.05) {
            classification = "Good";
        } else if (expectedPointsLost <= 0.10) {
            classification = "Inaccuracy";
        } else if (expectedPointsLost <= 0.20) {
            classification = "Mistake";
        } else { // Greater than 0.20 points lost
            classification = "Blunder";
        }

        // Brilliant Move: "a Brilliant move is when you find a good piece sacrifice."
        const materialBefore = this.getMaterialValue(boardBeforeMove.board(), playerColor);
        const materialAfter = this.getMaterialValue(boardAfterMove.board(), playerColor);
        const materialLost = materialBefore - materialAfter;

        if (materialLost > 0.9 && (classification === "Best" || classification === "Excellent")) { // Assuming >0.9 material lost (e.g., a pawn)
            // Ensure it's not already an overwhelmingly winning position
            if (initialExpectedPoints < 0.95) {
                classification = "Brilliant";
            }
        }

        // Great Move: "critical to the outcome... finding the only good move"
        if (classification === "Best" && initialExpectedPoints < 0.8 && moveExpectedPoints > initialExpectedPoints + 0.15) {
            classification = "Great";
        }

        return classification;
    }

    public async analyzeChessMove(fen: string, depth: number = this.STOCKFISH_DEPTH): Promise<StockfishResponse> {
        await this.enforceRateLimit();

        try {
            const response = await this.axiosInstance.get<StockfishResponse>('', {
                params: {
                    fen: fen,
                    depth: depth
                },
            });

            // Check if the API response itself indicates an error, even if HTTP status is 200
            // IMPORTANT: If success is true, but evaluation/bestmove are null (e.g., checkmate scenarios),
            // we should still return the response as is. analyzeAndClassifyMove will handle these nulls gracefully.
            if (!response.data || !response.data.success) {
                throw new Error(`Stockfish API returned an error or malformed data: ${response.data?.error || 'Unknown error'}`);
            }
            return response.data;

        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`[StockfishService] Axios error calling Stockfish API for FEN ${fen}:`, error.message);
                if (error.response) {
                    console.error('[StockfishService] Stockfish API Response Data:', error.response.data);
                    console.error('[StockfishService] Stockfish API Response Status:', error.response.status);
                } else if (error.request) {
                    console.error('[StockfishService] No response received from Stockfish API (request made):');
                }
            } else {
                console.error(`[StockfishService] Unexpected error during Stockfish API call for FEN ${fen}:`, error);
            }
            // We re-throw the error here so analyzeAndClassifyMove can catch it and provide defaults.
            throw new Error(`Failed to get Stockfish evaluation for FEN ${fen}: ${(error as Error).message}`);
        }
    }

    // MODIFICATION 3: Extensive changes for robustness and defaulting
    public async analyzeAndClassifyMove(fenBeforeMove: string, moveDetails: Move, moveNumber: number): Promise<IMove> {
        // Initialize analysisResult with all fields, setting safe defaults
        const analysisResult: IMove = {
            playerId: '',
            moveNumber: moveNumber,
            move: moveDetails.san,
            fen: '', // Will be updated to fenAfterMove
            playerColor: 'w', // Placeholder, will be updated by Chess.js turn
            classification: 'Unclassified', // Default during processing
            initialEvalCP: 0,
            moveEvalCP: 0,
            initialExpectedPoints: 0,
            moveExpectedPoints: 0,
            bestMoveExpectedPoints: 0,
            expectedPointsLost: 0,
            bestmove: '',
            evaluation: 0, // Raw evaluation
            mate: null,    // Mate in X
            continuation: '',
            error: undefined, // Explicitly undefined if no error
            timestamp: new Date(),
            duration: 5,
        };

        // Create initial board for player color and best move processing later
        const boardBeforeMoveInstance = new Chess(fenBeforeMove);
        const playerColor = boardBeforeMoveInstance.turn(); // Determine whose turn it is (who made this move)
        analysisResult.playerColor = playerColor; // Set accurate player color

        // Create board after the move for evaluation and classification
        const boardAfterMoveInstance = new Chess(fenBeforeMove);
        try {
            const actualMoveMade = boardAfterMoveInstance.move(moveDetails);
            if (!actualMoveMade) {
                throw new Error(`Invalid move detected during analysis for FEN ${fenBeforeMove}: ${moveDetails.san}`);
            }
            const fenAfterMove = boardAfterMoveInstance.fen();
            analysisResult.fen = fenAfterMove; // Store the FEN *after* the move
        } catch (error) {
            console.error(`[StockfishService] Critical Chess.js error applying move ${moveDetails.san} (Move #${moveNumber}) for FEN ${fenBeforeMove}:`, (error as Error).message);
            analysisResult.error = `Chess.js error: ${(error as Error).message}`;
            analysisResult.classification = 'Analysis Error'; // Cannot proceed with reliable analysis
            return analysisResult; // Return early if the move itself is invalid per chess.js
        }


        // 2. Get initial evaluation (before player's move)
        let initialStockfishResponse: StockfishResponse | null = null;
        try {
            initialStockfishResponse = await this.analyzeChessMove(fenBeforeMove);
        } catch (error) {
            console.warn(`[StockfishService] Initial Stockfish response failed for FEN ${fenBeforeMove}: ${(error as Error).message}. Using default evaluation.`);
            // Fallback to a default response if API call fails
            initialStockfishResponse = { success: false, evaluation: 0, mate: null, bestmove: null, continuation: '', error: (error as Error).message };
        }
        // Safely parse initial evaluation, using 0 for nulls
        const initialEvalCP = this.parseStockfishEval(
            initialStockfishResponse?.mate !== null ? initialStockfishResponse?.mate : initialStockfishResponse?.evaluation,
            initialStockfishResponse?.mate !== null ? 'mate' : 'eval'
        );
        let initialExpectedPoints = this.centipawnsToExpectedPoints(initialEvalCP);
        if (playerColor === 'b') { // Adjust for black's perspective
            initialExpectedPoints = 1 - initialExpectedPoints;
        }
        analysisResult.initialEvalCP = initialEvalCP;
        analysisResult.initialExpectedPoints = parseFloat(initialExpectedPoints.toFixed(3));


        // 3. Get evaluation after the player's move
        let moveStockfishResponse: StockfishResponse | null = null;
        try {
            moveStockfishResponse = await this.analyzeChessMove(analysisResult.fen); // Use fen after move
        } catch (error) {
            console.warn(`[StockfishService] Move Stockfish response failed for FEN ${analysisResult.fen}: ${(error as Error).message}. Using default evaluation.`);
            // Fallback to a default response if API call fails
            moveStockfishResponse = { success: false, evaluation: 0, mate: null, bestmove: null, continuation: '', error: (error as Error).message };
        }
        // Safely parse move evaluation, using 0 for nulls
        const moveEvalCP = this.parseStockfishEval(
            moveStockfishResponse?.mate !== null ? moveStockfishResponse?.mate : moveStockfishResponse?.evaluation,
            moveStockfishResponse?.mate !== null ? 'mate' : 'eval'
        );
        let moveExpectedPoints = this.centipawnsToExpectedPoints(moveEvalCP);
        if (playerColor === 'b') { // Adjust for black's perspective
            moveExpectedPoints = 1 - moveExpectedPoints;
        }
        analysisResult.moveEvalCP = moveEvalCP;
        analysisResult.moveExpectedPoints = parseFloat(moveExpectedPoints.toFixed(3));
        analysisResult.evaluation = moveStockfishResponse?.evaluation ?? 0; // Use nullish coalescing
        analysisResult.mate = moveStockfishResponse?.mate ?? null;        // Use nullish coalescing
        analysisResult.continuation = moveStockfishResponse?.continuation ?? '';


        // 4. Get evaluation of the *best* move from the initial position
        const bestMoveUCI = initialStockfishResponse?.bestmove; // Use optional chaining
        let bestMoveExpectedPoints: number;

        if (bestMoveUCI) {
            const bestMoveTempBoard = new Chess(fenBeforeMove);
            try {
                const bestMoveResult = bestMoveTempBoard.move(bestMoveUCI);
                if (!bestMoveResult) {
                    console.warn(`[StockfishService] Stockfish's best move (${bestMoveUCI}) is invalid on FEN: ${fenBeforeMove}. Falling back to initial expected points.`);
                    bestMoveExpectedPoints = initialExpectedPoints;
                } else {
                    const bestMoveFEN = bestMoveTempBoard.fen();
                    let bestMoveStockfishResponse: StockfishResponse | null = null;
                    try {
                        bestMoveStockfishResponse = await this.analyzeChessMove(bestMoveFEN);
                    } catch (error) {
                        console.warn(`[StockfishService] Best move Stockfish response failed for FEN ${bestMoveFEN}: ${(error as Error).message}. Falling back to initial expected points.`);
                        // Fallback to a default response if API call fails
                        bestMoveStockfishResponse = { success: false, evaluation: 0, mate: null, bestmove: null, continuation: '', error: (error as Error).message };
                    }
                    // Safely parse best move evaluation, using 0 for nulls
                    const bestMoveEvalCP = this.parseStockfishEval(
                        bestMoveStockfishResponse?.mate !== null ? bestMoveStockfishResponse?.mate : bestMoveStockfishResponse?.evaluation,
                        bestMoveStockfishResponse?.mate !== null ? 'mate' : 'eval'
                    );
                    bestMoveExpectedPoints = this.centipawnsToExpectedPoints(bestMoveEvalCP);
                    if (playerColor === 'b') { // Adjust for black's perspective
                        bestMoveExpectedPoints = 1 - bestMoveExpectedPoints;
                    }
                }
            } catch (bestMoveError) {
                console.warn(`[StockfishService] Error evaluating Stockfish's best move (${bestMoveUCI}) for FEN ${fenBeforeMove}:`, (bestMoveError as Error).message);
                bestMoveExpectedPoints = initialExpectedPoints; // Fallback if general error during best move processing
            }
        } else {
            console.warn(`[StockfishService] No bestmove provided by Stockfish for FEN ${fenBeforeMove} (e.g., game over, API error). Defaulting bestMoveExpectedPoints to initialExpectedPoints.`);
            bestMoveExpectedPoints = initialExpectedPoints; // If no best move, assume current position is best for now
        }
        analysisResult.bestmove = bestMoveUCI ?? ''; // Store best move, default to empty string
        analysisResult.bestMoveExpectedPoints = parseFloat(bestMoveExpectedPoints.toFixed(3));


        // 5. Classify the move using all calculated expected points
        const classification = this.classifyMove({
            initialExpectedPoints,
            moveExpectedPoints,
            bestMoveExpectedPoints,
            boardBeforeMove: boardBeforeMoveInstance, // Pass original board for material
            boardAfterMove: boardAfterMoveInstance,   // Pass actual board after move for checkmate/material
            playerColor
        });
        analysisResult.classification = classification;
        analysisResult.expectedPointsLost = parseFloat((initialExpectedPoints - moveExpectedPoints).toFixed(3));

        //console.log(`[StockfishService] Classification complete for move ${moveDetails.san}: ${classification}`);
        return analysisResult; // Return the fully populated IMove
    }

    public async testConnection(): Promise<boolean> {
        try {
            const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            // Use a low depth for a quick test
            await this.analyzeChessMove(startingPosition, 5);
            console.log('[StockfishService] Stockfish API connection test successful.');
            return true;
        } catch (error) {
            console.error('[StockfishService] Stockfish API connection test failed:', error);
            return false;
        }
    }

    // MODIFICATION 4: Refine calculateGameAccuracy
    public async calculateGameAccuracy(playerMoves: IMove[]): Promise<number> {
        if (playerMoves.length === 0) {
            return 100; // Return 100% accuracy if no moves (can be adjusted to 0 or N/A based on preference)
        }

        let totalExpectedPointsLost = 0;
        let validMovesCount = 0; // Only count moves that were successfully analyzed

        // Sum up the expected points lost for all valid moves by this player
        for (const move of playerMoves) {
            // Only sum if the move was successfully analyzed and expectedPointsLost is defined
            // and not classified as an 'Analysis Error' (meaning internal issues prevented analysis)
            if (move.expectedPointsLost !== undefined && move.classification !== 'Analysis Error') {
                // We use Math.max(0, ...) because expectedPointsLost can be negative (player gained points)
                // When calculating 'loss', we're interested in the positive deviation from optimal.
                totalExpectedPointsLost += Math.max(0, move.expectedPointsLost);
                validMovesCount++;
            } else {
                console.warn(`[StockfishService] Skipping move ${move.moveNumber} (${move.move}) from accuracy calculation due to analysis error or missing data (Classification: ${move.classification}, EPL: ${move.expectedPointsLost}).`);
            }
        }

        if (validMovesCount === 0) {
            console.warn("[StockfishService] No valid moves found for accuracy calculation. Returning 0.");
            return 0; // If no moves could be analyzed, accuracy is 0.
        }

        // Calculate the average expected points lost per valid move
        const averageExpectedPointsLost = totalExpectedPointsLost / validMovesCount;

        // No need to throw error here, `validMovesCount` handles division by zero.
        // `averageExpectedPointsLost` will be finite as long as `validMovesCount` > 0.


        // Scale the average loss to an accuracy percentage
        // The formula aims for 100% when avg loss is 0, and 0% when avg loss is MAX_AVG_EXPECTED_POINTS_LOSS_FOR_0_ACCURACY
        let accuracy = 100 * (1 - (averageExpectedPointsLost / this.MAX_AVG_EXPECTED_POINTS_LOSS_FOR_0_ACCURACY));

        // This check is mostly for paranoia, but good to keep.
        if (isNaN(accuracy) || !isFinite(accuracy)) {
            console.error("[StockfishService] Invalid accuracy calculation resulted in NaN or Infinity:", {
                totalExpectedPointsLost,
                averageExpectedPointsLost,
                accuracy,
                validMovesCount
            });
            return 0; // Return 0 or re-evaluate if this state is truly possible
        }

        // Apply a base bonus to make scores feel a bit higher, similar to CAPS2.
        accuracy += this.BASE_ACCURACY_BONUS;


        // Ensure the accuracy is clamped between 0 and 100
        accuracy = Math.max(0, Math.min(100, accuracy));

        // Return a rounded accuracy score
        return parseFloat(accuracy.toFixed(2));
    }


}
export const stockfishService = new StockfishService();
