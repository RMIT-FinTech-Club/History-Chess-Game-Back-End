/* eslint-disable @typescript-eslint/no-explicit-any */
import Web3 from "web3";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const web3 = new Web3("http://127.0.0.1:7545");

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load ABIs from Truffle build
const NFTArtifact = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../truffle/build/contracts/NFT.json"),
    "utf8"
  )
);
const NFTMarketplaceArtifact = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../truffle/build/contracts/NFTMarketplace.json"),
    "utf8"
  )
);

export const NFTContract = new web3.eth.Contract(
  NFTArtifact.abi as any,
  process.env.NFTContract_Contract_Address as string
);
export const NFTMarketplaceContract = new web3.eth.Contract(
  NFTMarketplaceArtifact.abi as any,
  process.env.NFTMarketplaceContract_Contract_Address as string
);

export default web3;
