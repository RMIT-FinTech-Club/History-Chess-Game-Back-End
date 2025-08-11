// tests/blockchain-connection.test.ts
import { Web3 } from 'web3';
import { config } from 'dotenv';

// Load environment variables
config();

// GameCoin contract ABI - same as in your BlockchainService
const GAME_COIN_ABI: any[] = [
  {
    "inputs": [{"name": "player", "type": "address"}],
    "name": "rewardPvPWin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "player", "type": "address"}],
    "name": "rewardBotWin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol", 
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

/**
 * BLOCKCHAIN CONNECTION TEST SUITE
 * Tests the foundation of the blockchain reward system
 * Ensures all components can connect and communicate
 */
async function runConnectionTests(): Promise<void> {
  console.log('Starting Blockchain Connection Tests...\n');
  
  let passedTests = 0;
  let totalTests = 0;

  // Helper function to run individual tests
  const runTest = async (testName: string, testFunction: () => Promise<void>) => {
    totalTests++;
    try {
      console.log(`🔍 Testing: ${testName}`);
      await testFunction();
      console.log(`✅ PASSED: ${testName}\n`);
      passedTests++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`❌ FAILED: ${testName}`);
      console.log(`   Error: ${errorMessage}\n`);
    }
  };

  // TEST 1: Environment Variables
  await runTest('Environment Variables Loading', async () => {
    const contractAddress = process.env.GAME_COIN_CONTRACT_ADDRESS;
    const rpcUrl = process.env.RPC_URL;
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

    if (!contractAddress) throw new Error('GAME_COIN_CONTRACT_ADDRESS not found in .env');
    if (!rpcUrl) throw new Error('RPC_URL not found in .env');
    if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY not found in .env');

    console.log(`   Contract Address: ${contractAddress}`);
    console.log(`   RPC URL: ${rpcUrl}`);
    console.log(`   Private Key: ${privateKey.substring(0, 10)}...`);
  });

  // TEST 2: Web3 Connection to Ganache
  let web3: Web3;
  await runTest('Web3 Connection to Ganache', async () => {
    web3 = new Web3(process.env.RPC_URL!);
    
    // Test connection by getting network ID
    const networkId = await web3.eth.net.getId();
    const blockNumber = await web3.eth.getBlockNumber();
    
    console.log(`   Network ID: ${networkId}`);
    console.log(`   Current Block: ${blockNumber}`);
    
    if (blockNumber < 1) throw new Error('No blocks found - is Ganache running?');
  });

  // TEST 3: GameCoin Contract Loading
  let contract: any;
  await runTest('GameCoin Contract Loading', async () => {
    contract = new web3.eth.Contract(
      GAME_COIN_ABI,
      process.env.GAME_COIN_CONTRACT_ADDRESS
    );

    // Verify contract is deployed by calling a view function
    const contractAddress = contract.options.address;
    console.log(`   Contract loaded at: ${contractAddress}`);
    
    // Check if contract exists by getting code
    const code = await web3.eth.getCode(contractAddress);
    if (code === '0x') throw new Error('No contract found at this address');
    
    console.log(`   Contract bytecode length: ${code.length} characters`);
  });

  // TEST 4: Deployer Account Setup
  let deployerAddress: string;
  await runTest('Deployer Account Setup', async () => {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY!;
    
    // Add private key to Web3 wallet
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);
    deployerAddress = account.address;
    
    // Check account balance
    const balance = await web3.eth.getBalance(deployerAddress);
    const balanceEth = web3.utils.fromWei(balance, 'ether');
    
    console.log(`   Deployer Address: ${deployerAddress}`);
    console.log(`   ETH Balance: ${balanceEth} ETH`);
    
    if (parseFloat(balanceEth) < 0.1) {
      throw new Error('Insufficient ETH balance for gas fees');
    }
  });

  // TEST 5: Contract Basic Information
  await runTest('Contract Basic Information', async () => {
    const name = await contract.methods.name().call();
    const symbol = await contract.methods.symbol().call();
    const totalSupply = await contract.methods.totalSupply().call();
    
    console.log(`   Token Name: ${name}`);
    console.log(`   Token Symbol: ${symbol}`);
    console.log(`   Total Supply: ${web3.utils.fromWei(totalSupply, 'ether')} ${symbol}`);
    
    if (name !== 'GameCoin') throw new Error(`Expected name "GameCoin", got "${name}"`);
    if (symbol !== 'GC') throw new Error(`Expected symbol "GC", got "${symbol}"`);
  });

  // TEST 6: Contract Reward Methods
  await runTest('Contract Reward Methods Availability', async () => {
    // Test that reward methods exist by encoding function calls
    const testAddress = '0x1234567890123456789012345678901234567890';
    
    // Try encoding PvP reward call
    const pvpData = contract.methods.rewardPvPWin(testAddress).encodeABI();
    console.log(`   rewardPvPWin encoded: ${pvpData.substring(0, 20)}...`);
    
    // Try encoding Bot reward call  
    const botData = contract.methods.rewardBotWin(testAddress).encodeABI();
    console.log(`   rewardBotWin encoded: ${botData.substring(0, 20)}...`);
    
    // Test balance checking
    const balance = await contract.methods.balanceOf(testAddress).call();
    console.log(`   balanceOf test address: ${web3.utils.fromWei(balance, 'ether')} GC`);
  });

  // TEST 7: Gas Estimation
  await runTest('Gas Estimation for Reward Transactions', async () => {
    const testAddress = deployerAddress; // Use deployer address for estimation
    
    // Estimate gas for PvP reward
    const pvpGas = await contract.methods.rewardPvPWin(testAddress)
      .estimateGas({ from: deployerAddress });
    console.log(`   PvP reward gas estimate: ${pvpGas}`);
    
    // Estimate gas for Bot reward
    const botGas = await contract.methods.rewardBotWin(testAddress)
      .estimateGas({ from: deployerAddress });
    console.log(`   Bot reward gas estimate: ${botGas}`);
    
    // Check current gas price
    const gasPrice = await web3.eth.getGasPrice();
    console.log(`   Current gas price: ${web3.utils.fromWei(gasPrice, 'gwei')} gwei`);
    
    if (pvpGas > 500000) throw new Error('PvP reward gas too high');
    if (botGas > 500000) throw new Error('Bot reward gas too high');
  });

  // TEST 8: Account Permissions
  await runTest('Deployer Account Permissions', async () => {
    // Check if deployer can call reward functions (should not revert on estimation)
    const testAddress = deployerAddress;
    
    try {
      // These should not throw errors if permissions are correct
      await contract.methods.rewardPvPWin(testAddress).estimateGas({ from: deployerAddress });
      await contract.methods.rewardBotWin(testAddress).estimateGas({ from: deployerAddress });
      
      console.log(`   Deployer can call reward functions:`);
    } catch (error) {
      throw new Error('Deployer lacks permissions to call reward functions');
    }
  });

  // FINAL RESULTS
  console.log(' TEST RESULTS SUMMARY');
  console.log('========================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n ALL TESTS PASSED! Your blockchain setup is ready for reward testing!');
    
  } else {
    console.log('\n  Some tests failed.');
  }
}

// Run the tests
runConnectionTests().catch(error => {
  console.error(' Test suite crashed:', error);
  process.exit(1);
});