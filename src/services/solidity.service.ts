import { Web3 } from "web3";
import { config } from "../configs/unifiedConfig";
const elo_manager_artifact = require("../../build/contracts/EloManager.json");

export class SolidityService {
    private web3: Web3;
    private contractInstance: any = null;

    constructor() {
        this.web3 = new Web3(config.blockchain.rpcUrl);
        console.log(`[SolidityService] Connecting to RPC endpoint: ${config.blockchain.rpcUrl}`);
    }

    private async getContractInstance() {
        if (!this.contractInstance) {
            try {
                console.log("[SolidityService] Initializing Web3 contract instance...");
                
                const networkId = await this.web3.eth.net.getId();
                const networkIdStr = networkId.toString();
                const deployedNetwork = elo_manager_artifact.networks[networkIdStr];
                
                if (!deployedNetwork || !deployedNetwork.address) {
                    throw new Error(`Contract not deployed on network ${networkIdStr}.`);
                }
                
                const contractAddress = deployedNetwork.address;
                this.contractInstance = new this.web3.eth.Contract(
                    elo_manager_artifact.abi, 
                    contractAddress
                );
                
                console.log("[SolidityService] Web3 contract instance created at:", contractAddress);
            } catch (error) {
                console.error("[SolidityService] Failed to initialize contract:", error);
                throw error;
            }
        }
        return this.contractInstance;
    }

    public async getPlayerEloFromBlockchain(playerAddress: string): Promise<number> {
        try {
            const contract = await this.getContractInstance();
            const elo = await contract.methods.getElo(playerAddress).call();
            return Number(elo);
        } catch (error) {
            console.error("[SolidityService] Error getting ELO from blockchain:", error);
            throw error;
        }
    }

    public async updateAfterGameSolidity(playerA: string, newEloA: number, playerB: string, newEloB: number) {
        try {
            const contract = await this.getContractInstance();
            const accounts = await this.web3.eth.getAccounts();
            
            if (!accounts || accounts.length === 0) {
                throw new Error("No accounts available to send the transaction");
            }

            const fromAddress = accounts[0];
            
            // Simplified for now, in production these would be mapped properly
            const playerAAddress = accounts[0]; 
            const playerBAddress = accounts[1] || accounts[0]; 
            
            const receipt = await contract.methods.updateAfterGame(
                    playerAAddress, 
                    newEloA, 
                    playerBAddress, 
                    newEloB
                ).send({ from: fromAddress, gas: 300000 });
            
            console.log("[SolidityService] Transaction successful hash:", receipt.transactionHash);
            return receipt;
        } catch (error) {
            console.error("[SolidityService] Error updating Elo on-chain:", error);
            throw error;
        }
    }
}

export const solidityService = new SolidityService();
