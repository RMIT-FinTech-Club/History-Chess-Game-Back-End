import { RewardPublisher } from '../src/queues/publishers/reward.publisher';
import { getRabbitMQ } from '../src/configs/rabbitmq';

jest.mock('../src/configs/rabbitmq', () => ({
    getRabbitMQ: jest.fn()
}));

describe('RewardPublisher Unit Tests', () => {

    it('should successfully publish a reward message to the queue', async () => {
        const mockSendToQueue = jest.fn().mockReturnValue(true);
        const mockGetChannel = jest.fn().mockReturnValue({
            sendToQueue: mockSendToQueue
        });
        
        (getRabbitMQ as jest.Mock).mockReturnValue({
            isConnected: () => true,
            getChannel: mockGetChannel,
            getQueues: () => ({ rewardQueue: 'reward_queue' })
        });

        const rewardData = {
            userId: '12345',
            username: 'TestUser',
            walletAddress: '0xabc',
            amount: '10',
            gameId: 'game-abc',
            matchType: 'PvP' as 'PvP' | 'Bot',
            gameRewardId: 'reward-123',
            timestamp: new Date(),
            transactionType: 'reward' as 'reward'
        };

        const result = await RewardPublisher.publishReward(rewardData);

        expect(result).toBe(true);
        expect(mockGetChannel).toHaveBeenCalled();
        expect(mockSendToQueue).toHaveBeenCalledWith(
            'reward_queue',
            expect.any(Buffer),
            expect.objectContaining({ persistent: true })
        );
    });

    it('should throw an error if RabbitMQ is not connected', async () => {
        (getRabbitMQ as jest.Mock).mockReturnValue({
            isConnected: () => false
        });

        const rewardData = {
            userId: '12345',
            username: 'TestUser',
            walletAddress: '0xabc',
            amount: '10',
            gameId: 'game-abc',
            matchType: 'PvP' as 'PvP' | 'Bot',
            gameRewardId: 'reward-123',
            timestamp: new Date(),
            transactionType: 'reward' as 'reward'
        };

        await expect(RewardPublisher.publishReward(rewardData)).rejects.toThrow('RabbitMQ connection not available');
    });
});
