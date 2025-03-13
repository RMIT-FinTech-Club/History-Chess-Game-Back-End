import { Chess } from 'chess.js';
export interface GameState {
  fen: string; // Current board state in FEN notation
  players: {
    white: string; //id of white player
    black: string; //id of black player
  };
  moveHistory: string[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  move?: any;
  fen?: string;
  moveHistory?: string[];
  status?: string;     // "ongoing", "checkmate", "stalemate", "draw", etc.
  nextTurn?: string;   // "white" or "black"
}

/**
 * Validates and processes a chess move.
 *
 * @param gameState - The current game state, including FEN, players, and move history.
 * @param playerId - The ID of the player making the move.
 * @param moveNotation - The move in algebraic notation (e.g., "e4", "Nf3").
 * @param promotionPiece - (Optional) For pawn promotion, the piece to promote to (e.g., "q" for queen).
 *
 * @returns An object with validation status, updated FEN, move history, game status, and next turn.
 */
export function validateAndUpdateMove(
  gameState: GameState,
  playerId: string,
  moveNotation: string,
  promotionPiece?: string
): ValidationResult {
  // Initialize the chess engine with the current board state
  const chess = new Chess(gameState.fen);

  // Determine the active player based on whose turn it is
  const activeColor = chess.turn() === 'w' ? 'white' : 'black';
  if (gameState.players[activeColor] !== playerId) {
    return { valid: false, error: 'Not your turn.' };
  }

  // Prepare move options
  //sloppy : can be used to parse a variety of non-standard move notations
  const moveOptions: { sloppy: boolean; promotion?: string } = { sloppy: true };
  /*
  promotion checking process:
  1: piece.check --> must be pawn
  2: move must be at the end of the board
  3: promotion must be valid ( queen, etc )
  4: if all is true ---> moveOption.promotion = promotionPiece
  5: else --> illegal move
  */

  // to execute the move
  const moveResult = chess.move(moveNotation, moveOptions);
  if (!moveResult) {
    return { valid: false, error: 'Illegal move.' };
  }

  // Update the board state (FEN) and move history
  const newFEN = chess.fen();
  const newMoveHistory = [...gameState.moveHistory, moveNotation];

  // Determine the current game status based on chess.js state
  let status = 'ongoing';
  if (chess.isCheckmate()) {
    status = 'checkmate';
  } else if (chess.isStalemate()) {
    status = 'stalemate';
  } else if (chess.isDraw()) {
    status = 'draw';
  } else if (chess.isThreefoldRepetition()) {
    status = 'threefold repetition';
  } else if (chess.isInsufficientMaterial()) {
    status = 'insufficient material';
  }

  // Identify which player's turn is next
  const nextTurn = chess.turn() === 'w' ? 'white' : 'black';

  // Return the updated game state
  return {
    valid: true,
    move: moveResult,
    fen: newFEN,
    moveHistory: newMoveHistory,
    status,
    nextTurn
  };
}

