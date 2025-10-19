import { Server as SocketIOServer, Socket } from "socket.io";
import { Chess } from "chess.js";
import { FastifyInstance } from "fastify";
import { GameSession } from "../models/GameSession";
import { GameStatus, PlayMode } from "../types/enum";
import { InMemoryGameSession } from "../types/game.types";
import { CustomSocket } from "../types/socket.types";
import * as GameService from "./game.service";
import { saveMove } from "./game.service";
import amqplib from "amqplib";
import Web3 from "web3";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getChannel } from "../utils/rabbitmq";
import { mongoPrisma } from "../configs/mongoPrismaClient";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

//simport { StockfishService } from "./stockfish.service";

export const gameSessions = new Map<string, InMemoryGameSession>();
const onlineUsers = new Map<
  string,
  { userId: string; socketId: string; lastSeen: Date }
>();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const web3 = new Web3("http://127.0.0.1:7545");

const NFTMarketplaceArtifact = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../blockchain/truffle/build/contracts/NFTMarketplace.json"
    ),
    "utf8"
  )
);

const NFTMarketplaceContract = new web3.eth.Contract(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NFTMarketplaceArtifact.abi as any,
  process.env.NFTMarketplaceContract_Contract_Address as string
);

export async function createListing(io: SocketIOServer) {
  const ch = await getChannel();
  if (!ch) throw new Error("Failed to get channel");

  const QUEUE = "marketplace.create";
  await ch.prefetch(1); // One message at a time
  console.log("[create-worker] waiting for messages on", QUEUE);

  ch.consume(
    QUEUE,
    async (msg: amqplib.ConsumeMessage | null) => {
      if (!msg) return;

      const payload = JSON.parse(msg.content.toString());
      const { listingId, tokenId, price, sellerAddress, nftContractAddress } =
        payload;

      const maxRetries = 3;
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        attempt++;
        console.log(`[create-worker][attempt ${attempt}] Starting transaction`);

        try {
          const tx = NFTMarketplaceContract.methods.createListing(
            nftContractAddress,
            tokenId,
            price
          );

          const sendObj = { from: sellerAddress, gas: "200000" };
          console.log("[create-worker] Sending tx with params:", sendObj);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let txHashUpdatePromise: Promise<any> | null = null;
          const sendPromise = tx
            .send(sendObj)
            .on("transactionHash", async (txHash: string) => {
              console.log("[create-worker] Transaction hash received:", txHash);
              txHashUpdatePromise = mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: {
                  createTxHash: txHash,
                  status: "CREATE_IN_NETWORK",
                },
              });
              io.to("marketplaceRoom").emit("listingStatusUpdate", {
                data: {
                  listingId,
                  status: "CREATE_IN_NETWORK",
                  txHash,
                },
              });
            });

          const receipt = await sendPromise;
          console.log(
            "[create-worker] Transaction mined:",
            receipt.transactionHash
          );

          if (receipt?.status) {
            if (txHashUpdatePromise) {
              await txHashUpdatePromise;
              console.log(
                "[create-worker] First update (CREATE_IN_NETWORK) completed"
              );
            }

            let onchainId: string | number | null = null;
            let createTimestamp = null;

            if (receipt.events) {
              for (const k of Object.keys(receipt.events)) {
                const ev = receipt.events[k];
                if (ev?.event === "ListingCreated") {
                  onchainId =
                    (ev.returnValues?.listingId as string | number) ??
                    onchainId;
                  createTimestamp = ev.returnValues?.createTimestamp;
                }
              }
            }

            const updatedListing =
              await mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: {
                  status: "ON_SALE",
                  nftListingId: onchainId ? String(onchainId) : "",
                  createBlockNumber: String(receipt.blockNumber ?? ""),
                  createTimestamp: createTimestamp
                    ? new Date(Number(createTimestamp) * 1000)
                    : null,
                },
              });

            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              data: updatedListing,
            });

            console.log(
              "[create-worker] successfully updated listing status to ON_SALE"
            );

            success = true;
          } else {
            throw new Error("receipt.status false or missing");
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error(
            `[create-worker] attempt ${attempt} failed - message: ${message}`
          );
          if (attempt >= maxRetries) {
            const failedListing =
              await mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: { status: "CREATE_ERROR" },
              });

            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              data: failedListing,
              error: message,
            });
          } else {
            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              listingId,
              status: "CREATE_RETRYING",
              attempt,
              remaining: maxRetries - attempt,
              error: message,
            });
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
      }

      ch.ack(msg);
      // console.log("[create-worker] Job ACKed for", listingId);
    },
    { noAck: false }
  );
}

export async function purchaseListing(io: SocketIOServer) {
  const ch = await getChannel();
  if (!ch) throw new Error("Failed to get channel");

  const QUEUE = "marketplace.purchase";
  await ch.prefetch(1);
  console.log("[purchase-worker] waiting for messages on", QUEUE);

  ch.consume(
    QUEUE,
    async (msg: amqplib.ConsumeMessage | null) => {
      if (!msg) return;

      const payload = JSON.parse(msg.content.toString());
      const { listingId, nftListingId, price, buyerAddress } = payload;

      const maxRetries = 3;
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        attempt++;
        console.log(
          `[purchase-worker][attempt ${attempt}] Starting transaction`
        );

        try {
          const tx =
            NFTMarketplaceContract.methods.purchaseListing(nftListingId);
          const sendObj = { from: buyerAddress, value: price, gas: "200000" };
          console.log("[purchase-worker] Sending tx with params:", sendObj);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let txHashUpdatePromise: Promise<any> | null = null;
          const sendPromise = tx
            .send(sendObj)
            .on("transactionHash", async (txHash: string) => {
              console.log(
                "[purchase-worker] Transaction hash received:",
                txHash
              );
              txHashUpdatePromise = mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: { purchaseTxHash: txHash, status: "PURCHASE_IN_NETWORK" },
              });
              io.to("marketplaceRoom").emit("listingStatusUpdate", {
                data: { listingId, status: "PURCHASE_IN_NETWORK", txHash },
              });
            });

          const receipt = await sendPromise;
          console.log(
            "[purchase-worker] Transaction mined:",
            receipt.transactionHash
          );

          if (receipt?.status) {
            if (txHashUpdatePromise) await txHashUpdatePromise;

            let purchaseTimestamp = null;
            if (receipt.events) {
              for (const k of Object.keys(receipt.events)) {
                const ev = receipt.events[k];
                if (ev?.event === "ListingPurchased") {
                  purchaseTimestamp = ev.returnValues?.purchaseTimestamp;
                }
              }
            }

            const updatedListing =
              await mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: {
                  status: "PURCHASED",
                  purchaseBlockNumber: String(receipt.blockNumber ?? ""),
                  purchaseTimestamp: purchaseTimestamp
                    ? new Date(Number(purchaseTimestamp) * 1000)
                    : null,
                },
              });

            const buyer = await prisma.users.findUnique({
              where: { walletAddress: buyerAddress },
            });
            if (buyer)
              await prisma.nfts.update({
                where: { tokenId: updatedListing.tokenId },
                data: { ownerId: buyer.id },
              });
            else {
              throw new Error("Buyer does not exist in db");
            }

            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              data: updatedListing,
            });
            console.log(
              "[purchase-worker] successfully updated listing status to PURCHASED"
            );
            success = true;
          } else throw new Error("receipt.status false or missing");
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error(
            `[purchase-worker] attempt ${attempt} failed - message: ${message}`
          );

          if (attempt >= maxRetries) {
            const failedListing =
              await mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: { status: "PURCHASE_ERROR" },
              });
            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              data: failedListing,
              error: message,
            });
          } else {
            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              listingId,
              status: "PURCHASE_RETRYING",
              attempt,
              remaining: maxRetries - attempt,
              error: message,
            });
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
      }

      ch.ack(msg);
      // console.log("[purchase-worker] Job ACKed for", listingId);
    },
    { noAck: false }
  );
}

export async function cancelListing(io: SocketIOServer) {
  const ch = await getChannel();
  if (!ch) throw new Error("Failed to get channel");

  const QUEUE = "marketplace.cancel";
  await ch.prefetch(1);
  console.log("[cancel-worker] waiting for messages on", QUEUE);

  ch.consume(
    QUEUE,
    async (msg: amqplib.ConsumeMessage | null) => {
      if (!msg) return;

      const payload = JSON.parse(msg.content.toString());
      const { listingId, nftListingId, sellerAddress } = payload;

      const maxRetries = 3;
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        attempt++;
        console.log(`[cancel-worker][attempt ${attempt}] Starting transaction`);

        try {
          const tx = NFTMarketplaceContract.methods.cancelListing(nftListingId);
          const sendObj = { from: sellerAddress, gas: "150000" };
          console.log("[cancel-worker] Sending tx with params:", sendObj);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let txHashUpdatePromise: Promise<any> | null = null;
          const sendPromise = tx
            .send(sendObj)
            .on("transactionHash", async (txHash: string) => {
              console.log("[cancel-worker] Transaction hash received:", txHash);
              txHashUpdatePromise = mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: { cancelTxHash: txHash, status: "CANCEL_IN_NETWORK" },
              });
              io.to("marketplaceRoom").emit("listingStatusUpdate", {
                data: {
                  listingId,
                  status: "CANCEL_IN_NETWORK",
                  txHash,
                },
              });
            });

          const receipt = await sendPromise;
          console.log(
            "[cancel-worker] Transaction mined:",
            receipt.transactionHash
          );

          if (receipt?.status) {
            if (txHashUpdatePromise) await txHashUpdatePromise;

            let cancelTimestamp = null;
            if (receipt.events) {
              for (const k of Object.keys(receipt.events)) {
                const ev = receipt.events[k];
                if (ev?.event === "ListingCancelled") {
                  cancelTimestamp = ev.returnValues?.cancelTimestamp;
                }
              }
            }

            const updatedListing =
              await mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: {
                  status: "CANCELLED",
                  cancelBlockNumber: String(receipt.blockNumber ?? ""),
                  cancelTimestamp: cancelTimestamp
                    ? new Date(Number(cancelTimestamp) * 1000)
                    : null,
                },
              });

            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              data: updatedListing,
            });
            console.log(
              "[cancel-worker] successfully updated listing status to CANCELLED"
            );
            success = true;
          } else throw new Error("receipt.status false or missing");
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error(
            `[cancel-worker] attempt ${attempt} failed - message: ${message}`
          );

          if (attempt >= maxRetries) {
            const failedListing =
              await mongoPrisma.nFTMarketplaceListing.update({
                where: { id: listingId },
                data: { status: "CANCEL_ERROR" },
              });
            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              data: failedListing,
              error: message,
            });
          } else {
            io.to("marketplaceRoom").emit("listingStatusUpdate", {
              listingId,
              status: "CANCEL_RETRYING",
              attempt,
              remaining: maxRetries - attempt,
              error: message,
            });
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
      }

      ch.ack(msg);
      // console.log("[cancel-worker] Job ACKed for", listingId);
    },
    { noAck: false }
  );
}
const startTimer = (
  session: InMemoryGameSession,
  io: SocketIOServer,
  fastify: FastifyInstance
): void => {
  if (session.timer) clearInterval(session.timer);
  console.log("Starting timer for gameId:", session.gameId);
  console.log("Timer interval:", session.whiteTimeLeft);

  session.timer = setInterval(() => {
    const isWhiteTurn: boolean = session.chess.turn() === "w";
    if (isWhiteTurn) {
      session.whiteTimeLeft -= 1000;
      if (session.whiteTimeLeft <= 0) {
        endGame(fastify, session, io, "Black wins by time");
      }
    } else {
      session.blackTimeLeft -= 1000;
      if (session.blackTimeLeft <= 0) {
        endGame(fastify, session, io, "White wins by time");
      }
    }

    io.to(session.gameId).emit("timeUpdate", {
      whiteTimeLeft: session.whiteTimeLeft,
      blackTimeLeft: session.blackTimeLeft,
    });
  }, 1000);
};

const endGame = async (
  fastify: FastifyInstance,
  session: InMemoryGameSession,
  io: SocketIOServer,
  result: string
) => {
  if (session.timer) clearInterval(session.timer);

  const winnerId = result.includes("White")
    ? session.players[0]
    : result.includes("Black")
    ? session.players[1]
    : null;
  const eloUpdate = await GameService.updateElo(
    fastify.prisma,
    session.gameId,
    winnerId
  );

  // Save the game result to the database
  await GameService.saveGameResult(session.gameId, result);

  // Log the winner for debugging
  console.log(
    `Game ${session.gameId} ended. Result: ${result}. Winner: ${
      winnerId || "Draw"
    }`
  );

  session.status = GameStatus.finished;

  io.to(session.gameId).emit("gameOver", {
    ...getGameState(session),
    gameOver: true,
    result,
    eloUpdate,
  });

  if (eloUpdate && eloUpdate.whiteElo && eloUpdate.blackElo) {
    const whitePlayerId = session.players[0];
    const blackPlayerId = session.players[1];

    const whiteEloData = {
      userId: whitePlayerId,
      newElo: eloUpdate.whiteElo,
    };

    const blackEloData = {
      userId: blackPlayerId,
      newElo: eloUpdate.blackElo,
    };

    io.emit("eloUpdated", whiteEloData);

    io.emit("eloUpdated", blackEloData);
  }

  await GameService.calculateGameAccuracy(session.gameId);

  gameSessions.delete(session.gameId);
};

const getGameState = (session: InMemoryGameSession) => {
  return {
    fen: session.chess.fen(),
    players: session.players,
    status: session.status,
    turn: session.chess.turn(),
    inCheck: session.chess.inCheck(),
    gameOver: session.chess.isGameOver(),
    whiteTimeLeft: session.whiteTimeLeft,
    blackTimeLeft: session.blackTimeLeft,
    analyzing: false,
  };
};

// const getGameState = (session: GameSessionInterface) => {
//     return {yy,
//         fen: session.chess.fen(),
//         players: session.players,
//         status: session.status,
//         turn: session.chess.turn(),
//         inCheck: session.chess.inCheck(),
//         gameOver: session.chess.isGameOver(),
//         whiteTimeLeft: session.whiteTimeLeft,
//         blackTimeLeft: session.blackTimeLeft,
//         analyzing: false
//     };
// }

export const handleMove = async (
  socket: Socket,
  io: SocketIOServer,
  fastify: FastifyInstance,
  gameId: string,
  move: string,
  userId: string
) => {
  //console.log("Handling move for gameId:", gameId);
  //console.log("Current game sessions:", Array.from(gameSessions.keys()));

  const session = gameSessions.get(gameId);
  // onsole.log("Session: ", session);
  if (!session) {
    console.log("Game session not found for gameId:", gameId);
    socket.emit("error", { message: "Game session not found" });
    return;
  }

  // Use the userId passed directly from the client
  const currentPlayerId = userId;
  if (!currentPlayerId) {
    socket.emit("error", { message: "Player not identified" });
    return;
  }

  // Check if it's this player's turn
  const isWhiteTurn = session.chess.turn() === "w";
  const whitePlayerId = session.players[0];
  const blackPlayerId = session.players[1];

  if (
    (isWhiteTurn && currentPlayerId !== whitePlayerId) ||
    (!isWhiteTurn && currentPlayerId !== blackPlayerId)
  ) {
    socket.emit("error", { message: "Not your turn" });
    return;
  }

  try {
    // Calculate move duration
    const now = Date.now();
    const moveDuration = session.lastMoveTime ? now - session.lastMoveTime : 0;

    // Make the move in memory
    session.chess.move(move);

    // Save the move to the database with player color and ID
    const moveNumber = session.chess.history().length;
    const color = isWhiteTurn ? "white" : "black";
    const fen = session.chess.fen();

    // Save move with analysis (replaces saveMove)
    const analysisPromise = saveMove(
      gameId,
      move,
      moveNumber,
      color,
      currentPlayerId,
      moveDuration,
      fen
    );
    if (!analysisPromise) {
      console.error("Failed to save move analysis");
      socket.emit("error", { message: "Failed to save move analysis" });
      return;
    }
    session.lastMoveTime = now;

    // Broadcast the move to all players
    io.to(gameId).emit("gameState", {
      ...getGameState(session),
      moveNumber,
      move,
      color,
      playerId: currentPlayerId,
      analyzing: true,
    });

    // Handle analysis result asynchronously
    analysisPromise
      .then((analysis) => {
        if (analysis) {
          io.to(gameId).emit("moveAnalysis", {
            moveNumber,
            evaluation: analysis.evaluation,
            bestmove: analysis.bestmove,
            mate: analysis.mate,
            continuation: analysis.continuation,
            analyzing: false,
          });
        }
      })
      .catch((error) => {
        console.error("Move analysis failed:", error);
        io.to(gameId).emit("moveAnalysis", {
          moveNumber,
          analyzing: false,
          error: "Analysis failed",
        });
      });

    // If the game is already finished, send the final state
    if (session && session.status === GameStatus.finished) {
      const gameState = getGameState(session);
      let result = "";
      if (session.chess.isCheckmate()) {
        result = `Checkmate! ${
          session.chess.turn() === "w" ? "Black" : "White"
        } wins!`;
      } else if (session.chess.isDraw()) {
        result = "Draw!";
      } else if (session.chess.isStalemate()) {
        result = "Draw by stalemate!";
      } else if (session.chess.isThreefoldRepetition()) {
        result = "Draw by threefold repetition!";
      } else if (session.chess.isInsufficientMaterial()) {
        result = "Draw by insufficient material!";
      }
      io.to(gameId).emit("gameOver", {
        message: "Game over",
        gameState,
        result,
      });
    }

    // Check if the game is over
    if (session && session.chess.isGameOver()) {
      let result = "";

      if (session.chess.isCheckmate()) {
        result =
          session.chess.turn() === "w"
            ? "Black wins by checkmate"
            : "White wins by checkmate";
      } else if (session.chess.isDraw()) {
        if (session.chess.isStalemate()) {
          result = "Draw by stalemate";
        } else if (session.chess.isThreefoldRepetition()) {
          result = "Draw by repetition";
        } else if (session.chess.isInsufficientMaterial()) {
          result = "Draw by insufficient material";
        } else {
          result = "Draw";
        }
      }

      await endGame(fastify, session, io, result);
    } else {
      // Game continues
      if (session) startTimer(session, io, fastify);
    }
  } catch (error) {
    console.error("Error handling move:", error);
    socket.emit("error", { message: "Invalid move" });
  }
};

// Handle all the socket connection after successfully connected
export const handleSocketConnection = async (
  socket: CustomSocket,
  io: SocketIOServer,
  fastify: FastifyInstance
) => {
  console.log("New client connected:", socket.id);

  // Track user connection
  socket.on("identify", (userId: string) => {
    if (!userId) return;

    // Set the userId in socket data
    socket.data.userId = userId;

    // Remove user from any previous connections
    for (const [id, user] of onlineUsers.entries()) {
      if (user.userId === userId) {
        onlineUsers.delete(id);
      }
    }

    // Add new connection
    onlineUsers.set(socket.id, {
      userId,
      socketId: socket.id,
      lastSeen: new Date(),
    });

    // Notify all clients about the updated online users
    io.emit(
      "onlineUsers",
      Array.from(onlineUsers.values()).map((u) => u.userId)
    );
  });

  socket.on("joinMarketplace", () => {
    socket.join("marketplaceRoom");
    console.log(`[socket] User ${socket.id} joined marketplaceRoom`);
  });

  socket.on("leaveMarketplace", () => {
    socket.leave("marketplaceRoom");
    console.log(`[socket] User ${socket.id} left marketplaceRoom`);
  });

  // Handle game challenge
  socket.on(
    "challengeUser",
    async (data: {
      opponentId: string;
      playMode: PlayMode;
      colorPreference: "white" | "black" | "random";
    }) => {
      const result = await GameService.challengeUser(
        fastify.prisma,
        io,
        socket,
        data.opponentId,
        data.playMode,
        data.colorPreference
      );

      if (!result.success) {
        socket.emit("challengeError", result);
      }
    }
  );

  // Handle challenge response
  socket.on("respondToChallenge", async (data: { accept: boolean }) => {
    const result = await GameService.respondToChallenge(
      fastify.prisma,
      io,
      socket,
      data.accept
    );

    if (!result.success) {
      socket.emit("challengeError", result);
    }
  });

  // Handle get online users
  socket.on("getOnlineUsers", () => {
    const users = Array.from(onlineUsers.values()).map((u) => u.userId);
    socket.emit("onlineUsers", users);
  });

  // Handle find match request
  socket.on("findMatch", async ({ userId, playMode, colorChoice }) => {
    try {
      const result = await GameService.findMatch(
        fastify.prisma,
        userId,
        playMode,
        colorChoice,
        socket.id
      );

      if (result) {
        // Match found, notify both players
        const { gameId, matchedPlayer } = result;

        // Notify the matched player
        io.to(matchedPlayer.socketId).emit("matchFound", {
          gameId,
          playMode,
          colorChoice,
        });

        // Notify the current player
        socket.emit("matchFound", {
          gameId,
          playMode,
          colorChoice,
        });
      } else {
        // No match found, player is in queue
        socket.emit("inQueue", {
          message: "Waiting for opponent...",
        });
      }
    } catch (error) {
      console.error("Error in findMatch:", error);
      socket.emit("error", { message: "Failed to find match" });
    }
  });

  // Handle cancel matchmaking
  socket.on("cancelMatchmaking", ({ userId }) => {
    GameService.removeFromMatchmaking(userId);
    socket.emit("matchmakingCancelled");
  });

  // Handle join game with specific Game ID and User ID
  socket.on("joinGame", async ({ gameId, userId }) => {
    let session: InMemoryGameSession | null = gameSessions.get(
      gameId
    ) as InMemoryGameSession;
    console.log("Joining game with ID:", gameId);

    // Get the game session from database
    const gameDoc = await GameSession.findOne({ gameId });

    // Check if the game session existed in the database
    if (!gameDoc || !gameDoc.whitePlayerId || !gameDoc.blackPlayerId) {
      console.log(
        "Game not found in database or missing player information:",
        gameId
      );
      socket.emit("error", { message: "Game not found or invalid" });
      return;
    }

    // Check if this is a rejoin (session exists) or new join
    const isRejoin = !!session;

    // If the game not in the system current session then create new game session
    if (!session) {
      console.log("Creating new game session for:", gameId);

      // Get move history from database to restore game state
      const moves = await GameService.getGameMoves(gameId);
      const chess = new Chess();

      // Replay moves to get current position
      if (moves && moves.length > 0) {
        try {
          moves.forEach((moveData) => chess.move(moveData.move));
        } catch (error) {
          console.error("Error replaying moves:", error);
        }
      }

      session = {
        gameId,
        players: [gameDoc.whitePlayerId, gameDoc.blackPlayerId], // Set players in correct order
        playerSockets: [socket],
        chess: chess, // Use the chess instance with moves replayed
        status: GameStatus.active,
        whiteTimeLeft: gameDoc.whiteTimeLeft || gameDoc.timeLimit,
        blackTimeLeft: gameDoc.blackTimeLeft || gameDoc.timeLimit,
        gameState: "",
        lastMoveTime: undefined,
      };
      gameSessions.set(gameId, session);
    } else {
      // Add socket to existing session if not already there
      if (!session.playerSockets.find((s) => s.id === socket.id)) {
        session.playerSockets.push(socket);
      }
    }

    // Join the game room
    socket.join(gameId);

    // Send current game state to the joining player
    if (session) {
      const gameState = {
        ...getGameState(session),
        playerColor: userId === gameDoc.whitePlayerId ? "white" : "black",
      };
      socket.emit("gameState", gameState);

      // Send move history for rejoining players
      if (isRejoin) {
        const moves = await GameService.getGameMoves(gameId);
        if (moves && moves.length > 0) {
          socket.emit("moveHistory", { moves });
        }
      }

      // Check if both players are connected
      const connectedPlayers = new Set(
        session.playerSockets.map((s) => s.data?.userId || "")
      );
      const bothPlayersConnected = session.players.every((playerId) =>
        connectedPlayers.has(playerId)
      );

      if (bothPlayersConnected && !isRejoin) {
        // This is a truly new game start
        startTimer(session, io, fastify);

        // Notify both players that the game is starting
        io.to(gameId).emit("gameStart", {
          gameId: gameId,
          initialGameState: session.chess.fen(),
          players: session.players,
          whiteTimeLeft: session.whiteTimeLeft,
          blackTimeLeft: session.blackTimeLeft,
          whitePlayerId: gameDoc.whitePlayerId,
          blackPlayerId: gameDoc.blackPlayerId,
          isNewGame: true, // Flag to indicate this is a new game
        });
      } else if (bothPlayersConnected && isRejoin) {
        // Game is resuming
        if (session.status === GameStatus.paused) {
          session.status = GameStatus.active;
          startTimer(session, io, fastify);
        }
        io.to(gameId).emit("gameResumed", { message: "Game resumed" });
      }
    }
  });

  // Handle move from client side
  socket.on("move", async ({ gameId, move, userId }) => {
    await handleMove(socket, io, fastify, gameId, move, userId);
  });

  // Handle rejoin game
  socket.on("rejoinGame", async ({ gameId, userId }) => {
    const session = gameSessions.get(gameId);
    if (session && session.players.includes(userId)) {
      socket.data = { gameId, userId };
      socket.join(gameId);

      // Send move history to rejoining player
      const moves = await GameService.getGameMoves(gameId);
      if (moves && moves.length > 0) {
        socket.emit("moveHistory", { moves });
      }

      if (
        session &&
        session.players.length === 2 &&
        session.status === GameStatus.paused
      ) {
        session.status = GameStatus.active;
        startTimer(session, io, fastify);
        io.to(gameId).emit("gameResumed", { message: "Opponent reconnected" });
      }
      if (session) io.to(gameId).emit("gameState", getGameState(session));
    }
  });

  socket.on("disconnect", () => {
    fastify.log.info(`Client disconnected: ${socket.id}`);

    // Remove user from online users
    if (onlineUsers.has(socket.id)) {
      // const { userId } = onlineUsers.get(socket.id)!;
      onlineUsers.delete(socket.id);
      // Notify all clients about the updated online users
      io.emit(
        "onlineUsers",
        Array.from(onlineUsers.values()).map((u) => u.userId)
      );
    }

    if (onlineUsers.has(socket.id)) {
      const userId = onlineUsers.get(socket.id)!.userId;
      onlineUsers.delete(socket.id);
      fastify.log.info(
        `User ${userId} disconnected, online users: ${onlineUsers.size}`
      );
    }

    const gameId = socket.data?.gameId;
    const userId = socket.data?.userId;

    if (!gameId || !userId) return;

    const session: InMemoryGameSession = gameSessions.get(
      gameId
    ) as InMemoryGameSession;

    if (session && session.players.includes(userId)) {
      if (session.timer) clearInterval(session.timer);

      session.status = GameStatus.paused;
      io.to(gameId).emit("opponentDisconnected", {
        message: "Waiting for reconnect (30s)",
      });

      setTimeout(async () => {
        if (session && session.status === GameStatus.paused) {
          await endGame(
            fastify,
            session,
            io,
            `${
              userId === session.players[0] ? "Black" : "White"
            } wins by disconnect`
          );
        }
      }, 30000);
    }
  });

  socket.on("leaveGame", async ({ gameId, userId }) => {
    const session = gameSessions.get(gameId);
    if (session && session.players.includes(userId)) {
      const winner = userId === session.players[0] ? "Black" : "White";
      await endGame(fastify, session, io, `${winner} wins by forfeit`);
    }
  });
};
