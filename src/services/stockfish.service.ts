import axios from 'axios';

export interface StockfishResponse {
    success: boolean;
    evaluation: number;
    mate: number | null;
    bestmove: string;
    continuation: string;
}

export interface MoveAnalysis {
    moveNumber: number;
    move: string;
    fen: string;
    evaluation: number;
    bestmove: string;
    mate: number | null;
    continuation: string;
}

export class StockfishService {
    private readonly API_URL = 'https://stockfish.online/api/s/v2.php';
    private readonly TIMEOUT = 8000;
    private requestCount = 0;
    private lastRequestTime = 0;
    private readonly RATE_LIMIT_DELAY = 200;

    async analyzePosition(fen: string, depth: number = 12): Promise<StockfishResponse> {
        await this.enforceRateLimit();
        try {
            console.log(`Analyzing position with depth ${depth}...`);
            
            const response = await axios.get(this.API_URL, {
                params: {
                    fen: fen,
                    depth: depth
                },
                timeout: this.TIMEOUT,
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            this.requestCount++;

            return {
                success: response.data.success,
                evaluation: response.data.evaluation || 0,
                mate: response.data.mate || null,
                bestmove: response.data.bestmove || '',
                continuation: response.data.continuation || ''
            };

        } catch (error: any) {
            console.error('Stockfish API error:', error.message);
            throw new Error(`Analysis failed: ${error.message}`);
        }
    }

    async analyzeMove(fen: string, move: string, moveNumber: number): Promise<MoveAnalysis> {
        const analysis = await this.analyzePosition(fen, 12);
        
        return {
            moveNumber,
            move,
            fen,
            evaluation: analysis.evaluation,
            bestmove: analysis.bestmove,
            mate: analysis.mate,
            continuation: analysis.continuation,
        };
    }

    private async enforceRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
            const delay = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        this.lastRequestTime = Date.now();
    }

    getUsageStats(): { requestCount: number; lastRequestTime: number } {
        return {
            requestCount: this.requestCount,
            lastRequestTime: this.lastRequestTime
        };
    }

    async testConnection(): Promise<boolean> {
        try {
            const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            await this.analyzePosition(startingPosition, 5);
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }
}

export const stockfishService = new StockfishService();
