import { getRabbitMQ } from '../../configs/rabbitmq.ts';
import { stockfishService } from '../../services/stockfish.service.ts';
import { GameSession } from '../../models/GameSession.ts'; // Check correct import extension later

export const startStockfishWorker = async () => {
    try {
        const rabbitMQ = getRabbitMQ();
        if (!rabbitMQ.isConnected()) {
            console.error('RabbitMQ not connected. Worker cannot start.');
            return;
        }

        const channel = rabbitMQ.getChannel();
        const queues = rabbitMQ.getQueues();
        const queueName = queues.stockfishQueue;

        console.log(`Worker waiting for messages in ${queueName}...`);

        channel.consume(queueName, async (msg) => {
            if (msg !== null) {
                try {
                    const messageString = msg.content.toString();
                    const message = JSON.parse(messageString);

                    const { gameId, fenBeforeMove, moveDetails, moveNumber } = message;
                    
                    if (!gameId || !fenBeforeMove || !moveDetails || !moveNumber) {
                        throw new Error('Invalid stockfish message format');
                    }

                    // Process with stockfish
                    const analysis = await stockfishService.analyzeAndClassifyMove(fenBeforeMove, moveDetails, moveNumber);
                    
                    // Update GameSession in DB
                    const updateResult = await GameSession.updateOne(
                        { gameId, "moves.moveNumber": moveNumber },
                        {
                            $set: {
                                "moves.$.move": analysis.move,
                                "moves.$.fen": analysis.fen,
                                "moves.$.evaluation": analysis.evaluation,
                                "moves.$.bestmove": analysis.bestmove,
                                "moves.$.mate": analysis.mate,
                                "moves.$.continuation": analysis.continuation,
                                "moves.$.playerColor": analysis.playerColor,
                                "moves.$.initialEvalCP": analysis.initialEvalCP,
                                "moves.$.moveEvalCP": analysis.moveEvalCP,
                                "moves.$.initialExpectedPoints": analysis.initialExpectedPoints,
                                "moves.$.moveExpectedPoints": analysis.moveExpectedPoints,
                                "moves.$.bestMoveExpectedPoints": analysis.bestMoveExpectedPoints,
                                "moves.$.expectedPointsLost": analysis.expectedPointsLost,
                                "moves.$.classification": analysis.classification,
                                "moves.$.error": analysis.error || null,
                            },
                        }
                    );
                    
                    if (updateResult.modifiedCount !== 0) {
                        console.log(`Successfully analysed move ${moveNumber} for game ${gameId}`);
                    }

                    channel.ack(msg); // Acknowledge successful processing
                } catch (error) {
                    console.error('Error processing stockfish message:', error);
                    channel.nack(msg, false, false); // Nack and do not requeue (can update with DLQ later)
                }
            }
        });
    } catch (error) {
        console.error('Error starting stockfish worker:', error);
    }
}
