/* eslint-disable no-undef, no-console */
const path = require("path");

module.exports = {
  // Ensure Truffle reads/writes within the truffle sub-project
  contracts_directory: path.join(__dirname, "contracts"),
  migrations_directory: path.join(__dirname, "migrations"),
  contracts_build_directory: path.join(__dirname, "build", "contracts"),

  networks: {
    ganache: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
      gas: 6721975,
      gasPrice: 20000000000,
    },
  },
  compilers: {
    solc: {
      version: "0.8.21",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        evmVersion: "paris", // Try adding this
      },
    },
  },
};
