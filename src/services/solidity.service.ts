import { Web3 } from "web3"; // Updated for Web3 v4
const elo_manager_artifact = require("../../build/contracts/EloManager.json");

const ETHEREUM_ENDPOINT = process.env.ETHEREUM_ENDPOINT || "http://localhost:7545";
const web3 = new Web3(ETHEREUM_ENDPOINT);

console.log(`Connecting to Ethereum endpoint: ${ETHEREUM_ENDPOINT}`);

let contractInstance: any = null;

async function getContractInstance() {
    if (!contractInstance) {
        try {
            console.log("Initializing Web3 contract instance...");
            
            const blockNumber = await web3.eth.getBlockNumber();
            console.log("Connected to blockchain, current block:", blockNumber);
            
            const networkId = await web3.eth.net.getId();

            const networkIdStr = networkId.toString();
            const deployedNetwork = elo_manager_artifact.networks[networkIdStr];
            if (!deployedNetwork || !deployedNetwork.address) {
                console.error("Available networks in artifact:", Object.keys(elo_manager_artifact.networks));
                throw new Error(`Contract not deployed on network ${networkIdStr}. Available networks: ${Object.keys(elo_manager_artifact.networks).join(', ')}`);
            }
            
            const contractAddress = deployedNetwork.address;
            console.log("Contract address:", contractAddress);
            
            const code = await web3.eth.getCode(contractAddress);
            if (code === '0x' || code === '0x0') {
                throw new Error(`No contract deployed at address ${contractAddress}`);
            }
            
            contractInstance = new web3.eth.Contract(
                elo_manager_artifact.abi, 
                contractAddress
            );
            
            console.log("Web3 contract instance created successfully");
            
            if (!contractInstance.methods.getElo) {
                console.error("Available methods:", Object.keys(contractInstance.methods));
                throw new Error("getElo method not found in contract ABI");
            }
            
        } catch (error) {
            console.error("Failed to initialize contract:", error);
            contractInstance = null; 
            throw error;
        }
    }
    return contractInstance;
}

export const getPlayerEloFromBlockchain = async function(playerAddress: string): Promise<number> {
    try {
        const contract = await getContractInstance();
        const elo = await contract.methods.getElo(playerAddress).call();
        return Number(elo);
    } catch (error) {
        console.error("Error getting ELO from blockchain:", error);
        throw error;
    }
}

export const updateAfterGameSolidity = async function(playerA: string, newEloA: number, playerB: string, newEloB: number) {
    try {
        const contract = await getContractInstance();
        const accounts = await web3.eth.getAccounts();
        
        if (!accounts || accounts.length === 0) {
            throw new Error("No accounts available to send the transaction");
        }

        const fromAddress = accounts[0];
        
        // It should find the actual player addresses in a production environment
        const playerAAddress = accounts[0]; 
        const playerBAddress = accounts[1]; 
        
        console.log("Using from address:", fromAddress);
        
        const receipt = await contract.methods.updateAfterGame(
                playerAAddress, 
                newEloA, 
                playerBAddress, 
                newEloB
            ).send({ from: fromAddress, gas: 300000 });
        
        console.log("Transaction successful with hash:", receipt.transactionHash);
        console.log(playerA, "new ELO:", await getPlayerEloFromBlockchain(playerAAddress));
        console.log(playerB, "new ELO:", await getPlayerEloFromBlockchain(playerBAddress));
        return receipt;
    } catch (error: any) {
        console.error("Error updating Elo on-chain:", error);
        
        if (error.message && error.message.includes('gas')) {
            console.error("Gas estimation failed. The transaction might revert or require more gas.");
        } else if (error.message && error.message.includes('nonce')) {
            console.error("Nonce issue. Another transaction might be pending from the same account.");
        } else if (error.message && error.message.includes('insufficient funds')) {
            console.error("Insufficient funds for gas * price + value.");
        }
            
        throw error;
    }
}
