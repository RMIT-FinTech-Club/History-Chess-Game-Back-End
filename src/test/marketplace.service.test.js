const { uploadNFTItem, callMintNFT, callListItem } = require("../services/marketplace.service");
const { prisma } = require("../configs/prismaClient");
const ethers = require("ethers");

// Mock Ethers and Prisma
jest.mock("ethers");
jest.mock("../configs/prismaClient");

describe("Marketplace Service Tests", () => {
  const mockAdminId = "admin-uuid";
  const mockData = {
    name: "Bronze Sword",
    imageUrl: "url",
    rarity: "common",
    dynasty: 3,
    history: "Vietnamese artifact",
    price: 100
  };

  beforeEach(() => {
    prisma.users.findUnique.mockResolvedValue({ role: "admin" });
  });

  it("callMintNFT should mint and return tx/tokenId", async () => {
    const mockContract = {
      mintNFT: jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue({
        events: [{ event: "NFTMinted", args: { tokenId: ethers.BigNumber.from(1) } }]
      }) })
    };
    ethers.Contract.mockReturnValue(mockContract);

    const result = await callMintNFT("0xaddr", "uri");
    expect(result.tokenId.toNumber()).toBe(1);
    expect(mockContract.mintNFT).toHaveBeenCalledWith("0xaddr", "uri");
  });

  it("callListItem should list and return txHash", async () => {
    const mockContract = {
      listItem: jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue({ transactionHash: "0xtx" }) })
    };
    ethers.Contract.mockReturnValue(mockContract);

    const result = await callListItem(ethers.BigNumber.from(1), 100, 3);
    expect(result).toBe("0xtx");
    expect(mockContract.listItem).toHaveBeenCalled();
  });

  it("uploadNFTItem should upload if admin", async () => {
    jest.spyOn({ callMintNFT }, "callMintNFT").mockResolvedValue({ txHash: "mintTx", tokenId: ethers.BigNumber.from(1) });
    jest.spyOn({ callListItem }, "callListItem").mockResolvedValue("listTx");

    const result = await uploadNFTItem(mockAdminId, mockData);
    expect(result.mintTxHash).toBe("mintTx");
    expect(result.listTxHash).toBe("listTx");
    expect(prisma.nfts.create).toHaveBeenCalled();
  });

  it("uploadNFTItem should fail if not admin", async () => {
    prisma.users.findUnique.mockResolvedValue({ role: "user" });
    await expect(uploadNFTItem(mockAdminId, mockData)).rejects.toThrow("Not authorized");
  });
});