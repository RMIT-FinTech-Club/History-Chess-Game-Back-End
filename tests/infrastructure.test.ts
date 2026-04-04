import { initializeRabbitMQ, getRabbitMQ } from '../src/configs/rabbitmq.ts';
import Web3 from 'web3';

describe('Infrastructure Integration Tests', () => {
    
    // Increase timeout since we are testing external services that might be starting up
    jest.setTimeout(30000);

    it('should successfully connect to RabbitMQ via Docker Compose', async () => {
        // Use default rabbitmq url
        process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
        
        // Wait a small amount for rabbitmq to initialize if docker compose just ran
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await initializeRabbitMQ();
        
        const rabbit = getRabbitMQ();
        expect(rabbit.isConnected()).toBe(true);
        expect(rabbit.getChannel()).toBeDefined();

        await rabbit.close();
    });

    it('should successfully connect to Besu Blockchain Node via Docker Compose', async () => {
        const web3 = new Web3('http://localhost:8545'); // Besu default HTTP port
        
        // Let's test if the provider is actually responding correctly
        // by fetching the current block number or network ID
        const isListening = await web3.eth.net.isListening();
        expect(isListening).toBe(true);
        
        const chainId = await web3.eth.getChainId();
        expect(chainId.toString()).toBeDefined();
        
        // By default Besu dev network chain ID is usually 2018
        // Or at least it's a number
        expect(Number(chainId)).toBeGreaterThan(0);
        
        const blockNumber = await web3.eth.getBlockNumber();
        expect(blockNumber).toBeDefined();
    });

});
