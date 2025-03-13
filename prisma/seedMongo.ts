import { mongoPrisma } from "../src/configs/prismaClient";

async function seedMongoDB() {
  try {
    console.log("🌱 Seeding MongoDB (ftc_history_chess_game)...");

    // Insert Multiple Games
    const createdGames = await mongoPrisma.games.createMany({
      data: [
        {
          gameType: "PLAYER_VS_PLAYER",
          mode: "PUBLIC",
          status: "ONGOING",
          aiDifficulty: null,
          players: { white: 1, black: 2 },
          nftskins: { white: 101, black: 102 },
          timers: {
            white: { startTime: new Date(), currentTime: 600000 },
            black: { startTime: new Date(), currentTime: 600000 },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          gameType: "PLAYER_VS_AI",
          mode: "PRIVATE",
          status: "WAITING",
          aiDifficulty: "HARD",
          players: { white: 3, black: -1 },
          nftskins: { white: 103, black: null },
          timers: {
            white: { startTime: new Date(), currentTime: 500000 },
            black: { startTime: new Date(), currentTime: 500000 },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    console.log(`${createdGames.count} Games Created`);

    // 🏆 Retrieve the inserted game IDs
    const games = await mongoPrisma.games.findMany();
    const game1Id = games[0].id; // First game ID (ObjectID)
    const game2Id = games[1].id; // Second game ID (ObjectID)

    console.log(`🎯 Game IDs: ${game1Id}, ${game2Id}`);

    // ⚡ Insert Multiple Moves using the correct `ObjectId`
    const moves = await mongoPrisma.moves.createMany({
      data: [
        {
          moveName: "e4",
          playerId: "1",
          chessPiece: "pawn",
          gameId: game1Id, // Use ObjectID, not "game-1"
          createdAt: new Date(),
          isValid: true,
          result: "NONE",
        },
        {
          moveName: "e5",
          playerId: "2",
          chessPiece: "pawn",
          gameId: game1Id,
          createdAt: new Date(),
          isValid: true,
          result: "NONE",
        },
        {
          moveName: "d4",
          playerId: "3",
          chessPiece: "pawn",
          gameId: game2Id,
          createdAt: new Date(),
          isValid: true,
          result: "CHECK",
        },
      ],
    });

    console.log(`${moves.count} Moves Created`);

    console.log("Seeding MongoDB (ftc_history_chess_game) completed successfully!");
  } catch (error) {
    console.error("Error while seeding MongoDB:", error);
  } finally {
    await mongoPrisma.$disconnect();
  }
}

// Run the seeding script
seedMongoDB();
