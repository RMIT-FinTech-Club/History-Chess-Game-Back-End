import { postgresPrisma } from '../configs/prismaClient.ts';
import { AchievementProgress } from '../models/AchievementProgress.ts';

export const DYNASTIES = [
    {
        id: 1,
        name: "Ngô Dynasty",
        startElo: 0,
        endElo: 199,
        imageUrl: "/dynasties/ngo_dynasty.png",
        description: "After a thousand years of Northern domination, Ngô Quyền defeated the Southern Han fleet at the Battle of Bạch Đằng, reclaiming Vietnamese independence.",
        reward: {
            skinName: "Ngô Quyền - The Tide Caller",
            skinDescription: "A warrior king in bronze armor, standing amidst waves. Features ancient corroded bronze with wave patterns.",
            skinImageUrl: "/dynasties/ngo_quyen_skin_king.png",
            items: [
                { name: "Ironwood Stake", description: "A sharp wooden stake used to sink enemy ships at Bạch Đằng.", imageUrl: "/items/ironwood_stake.png" }
            ],
        },
        botLevel: 1,
        boardTheme: {
            light: "#DECDBE",
            dark: "#8B4513",
            accent: "#4682B4"
        }
    },
    {
        id: 2,
        name: "Đinh Dynasty",
        startElo: 200,
        endElo: 399,
        imageUrl: "https://ik.imagekit.io/historygame/ngoquyen.jpg?updatedAt=1755866819730",
        description: "The dynasty that unified the country as Đại Cồ Việt.",
        reward: {
            skinName: "Imperial Unifier",
            skinDescription: "A chess skin inspired by Emperor Đinh Tiên Hoàng",
            skinImageUrl: "https://ik.imagekit.io/historygame/ngoquyen.jpg",
            items: [],
        },
        botLevel: 3,
        boardTheme: {
            light: "#E8DCC8",
            dark: "#722F37",
            accent: "#B8860B"
        }
    },
    {
        id: 3,
        name: "Early Lê Dynasty",
        startElo: 400,
        endElo: 599,
        imageUrl: "https://ik.imagekit.io/historygame/ngoquyen.jpg?updatedAt=1755866819730",
        description: "A short but significant dynasty.",
        reward: {
            skinName: "Defender General",
            skinDescription: "A chess skin inspired by Lê Đại Hành",
            skinImageUrl: "https://ik.imagekit.io/historygame/ngoquyen.jpg",
            items: [],
        },
        botLevel: 5,
        boardTheme: {
            light: "#C8D4B8",
            dark: "#4A5D23",
            accent: "#8B4513"
        }
    },
    {
        id: 4,
        name: "Lý Dynasty",
        startElo: 600,
        endElo: 799,
        imageUrl: "https://ik.imagekit.io/historygame/ngoquyen.jpg?updatedAt=1755866819730",
        description: "The golden age that moved the capital to Thăng Long.",
        reward: {
            skinName: "Golden Dragon Emperor",
            skinDescription: "A chess skin inspired by the Lý Dynasty's prosperity",
            skinImageUrl: "https://ik.imagekit.io/historygame/ngoquyen.jpg",
            items: [],
        },
        botLevel: 8,
        boardTheme: {
            light: "#F5E6C8",
            dark: "#2F6B4F",
            accent: "#D4AF37"
        }
    },
    {
        id: 5,
        name: "Trần Dynasty",
        startElo: 800,
        endElo: 999,
        imageUrl: "https://ik.imagekit.io/historygame/ngoquyen.jpg?updatedAt=1755866819730",
        description: "The dynasty that defeated the Mongol Empire three times.",
        reward: {
            skinName: "Mongol Slayer",
            skinDescription: "A chess skin inspired by General Trần Hưng Đạo",
            skinImageUrl: "https://ik.imagekit.io/historygame/ngoquyen.jpg",
            items: [],
        },
        botLevel: 10,
        boardTheme: {
            light: "#D8D8D8",
            dark: "#4A4A4A",
            accent: "#8B0000"
        }
    }
];

export const ACHIEVEMENTS = [
    { id: "scholar", title: "Dynasty Scholar", description: "Explore the lore of 5 different dynasties", maxProgress: 5 },
    { id: "warrior", title: "War Historian", description: "Learn about 10 famous battles", maxProgress: 10 },
    { id: "collector", title: "Royal Collector", description: "Collect items from 3 different dynasties", maxProgress: 3 },
    { id: "legend", title: "Legend Keeper", description: "Discover 20 historical facts", maxProgress: 20 },
    { id: "culture", title: "Culture Bearer", description: "Participate in 5 cultural events", maxProgress: 5 }
];

export class QuestService {
    static async getAllDynasties() {
        return DYNASTIES;
    }

    static async getUserProgress(userId: string) {
        const user = await postgresPrisma.users.findUnique({
            where: { id: userId },
            select: {
                dynastyLevel: true,
                dynastyXp: true,
                elo: true,
                dynasty: true
            }
        });

        if (!user) throw new Error('User not found');

        // Logic to determine current dynasty and rank
        const LEVELS_PER_DYNASTY = 5;
        const currentDynastyId = Math.floor(((user.dynastyLevel || 1) - 1) / LEVELS_PER_DYNASTY) + 1;
        const currentRank = ((user.dynastyLevel || 1) - 1) % LEVELS_PER_DYNASTY + 1;

        const unlockedDynasties = DYNASTIES.filter(d => d.id <= currentDynastyId);

        return {
            dynastyLevel: user.dynastyLevel,
            dynastyXp: user.dynastyXp,
            xpToNextLevel: 500, // Fixed for simplicity
            xpProgressPercentage: ((user.dynastyXp || 0) / 500) * 100,
            currentDynasty: DYNASTIES.find(d => d.id === currentDynastyId) || DYNASTIES[0],
            currentLevel: currentRank,
            unlockedDynasties
        };
    }

    static async getSkins(userId: string) {
        // Fetch skins from user's NFTs
        const skins = await postgresPrisma.nfts.findMany({
            where: {
                ownerId: userId,
                detailedInfo: {
                    path: ['category'],
                    equals: 'skin'
                }
            }
        });
        return skins;
    }

    static async getAchievements(userId: string) {
        const progresses = await AchievementProgress.find({ userId });
        
        return ACHIEVEMENTS.map(ach => {
            const progress = progresses.find(p => p.achievementId === ach.id);
            return {
                achievementId: ach.id,
                currentProgress: progress ? progress.currentProgress : 0,
                maxProgress: ach.maxProgress,
                isUnlocked: progress ? progress.isUnlocked : false
            };
        });
    }

    static async updateAchievementProgress(userId: string, achievementId: string, currentProgress: number, maxProgress: number) {
        const isUnlocked = currentProgress >= maxProgress;
        
        const result = await AchievementProgress.findOneAndUpdate(
            { userId, achievementId },
            {
                $set: {
                    currentProgress,
                    maxProgress,
                    isUnlocked,
                    updatedAt: new Date()
                }
            },
            { upsert: true, new: true }
        );
        
        return result;
    }
}
