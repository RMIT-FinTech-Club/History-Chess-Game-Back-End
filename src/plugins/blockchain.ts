import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Contract, Wallet, JsonRpcProvider } from 'ethers'; // Correct import here
// Correct import paths for deployed contract artifacts
import NftMarketplaceDeployment from '../../../History-Chess-Game-Hardhat-Env/deployments/ganache/NftMarketplace.json';
import BasicNftDeployment from '../../../History-Chess-Game-Hardhat-Env/deployments/ganache/BasicNft.json';
import GameCoinDeployment from '../../../History-Chess-Game-Hardhat-Env/deployments/ganache/GameCoin.json';

// Extend FastifyInstance with all contract instances
declare module 'fastify' {
  interface FastifyInstance {
    nftMarketplaceContract: Contract;
    basicNftContract: Contract;
    gameCoinContract: Contract;
  }
}

const blockchainPlugin: FastifyPluginAsync = async (server: FastifyInstance) => {
  try {
    // Log the addresses to verify they are being read correctly from the JSON files.
    server.log.info(`Reading NftMarketplace address: ${NftMarketplaceDeployment.address}`);
    server.log.info(`Reading BasicNft address: ${BasicNftDeployment.address}`);
    server.log.info(`Reading GameCoin address: ${GameCoinDeployment.address}`);

    // Connect to the Ganache network
    const provider = new JsonRpcProvider('http://127.0.0.1:8545');

    // Use the first Ganache account's private key.
    // NOTE: This private key should be managed securely in a production environment.
    const signer = new Wallet('0xaa66b62b7bb53f443c1a7f4569c7509a43518e0ab6c139a2ead527dd01dd8bc7', provider);

    // NftMarketplace
    const nftMarketplaceContract = new Contract(
      NftMarketplaceDeployment.address,
      NftMarketplaceDeployment.abi,
      signer
    );
    server.decorate('nftMarketplaceContract', nftMarketplaceContract);

    // BasicNft
    const basicNftContract = new Contract(
      BasicNftDeployment.address,
      BasicNftDeployment.abi,
      signer
    );
    server.decorate('basicNftContract', basicNftContract);

    // GameCoin
    const gameCoinContract = new Contract(
      GameCoinDeployment.address,
      GameCoinDeployment.abi,
      signer
    );
    server.decorate('gameCoinContract', gameCoinContract);

    server.log.info('Successfully connected to Ganache and instantiated all contract instances.');
  } catch (error) {
    server.log.error('Error connecting to the blockchain:', error);
    throw error;
  }
};

export default fp(blockchainPlugin);