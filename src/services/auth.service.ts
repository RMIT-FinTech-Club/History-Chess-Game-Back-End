import { PrismaClient } from "@prisma/client"
import * as crypto from "crypto";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'ftc-chess-game-secret-key';
const TOKEN_EXPIRY = "24h";

const hashPassword = (password: string): string => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

// Verify password
const verifyPassword = (inputPassword: string, storedHash: string): boolean => {
    const inputHash = hashPassword(inputPassword);
    return inputHash === storedHash;
};

// Generate JWT token
const generateToken = (userId: string): string => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
};

// Verify JWT token
export const verifyToken = (token: string): { userId: string } | null => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        return decoded;
    } catch (error) {
        return null;
    }
};

export const authService = {
    // login user
    async login(email: string, password: string){
        const user = await prisma.users.findFirst({
            where: { email }
        })

        // if user not found or password doesn't match
        if(!user || !verifyPassword(password, user.hashedPassword)){
            return null;
        }

        // Generate JWT token
        const token = generateToken(user.id);

        const { hashedPassword: _, ...userWithoutPassword } = user;
        return {
            token, user: userWithoutPassword
        };
    },
    // register new user
    async register(userData: {
        username: string;
        email: string;
        password: string;
        walletAddress?: string;
    }){
        try {
            // check if the email or username exists already
            const existingUser = await prisma.users.findFirst({
                where: {
                    OR: [
                        { email: userData.email },
                        { username: userData.username },
                        ...(userData.walletAddress ? [{walletAddress: userData.walletAddress}] : []),
                    ],
                }
            });

            if(existingUser){
                return { error: "User with this email, username, or wallet address already exists" }
            }

            // Create new user
            const hashedPassword = hashPassword(userData.password);
            const newUser = await prisma.users.create({
                data: {
                    username: userData.username,
                    email: userData.email,
                    hashedPassword,
                    walletAddress: userData.walletAddress,
                },
            });

            // Generate JWT token
            const token = generateToken(newUser.id);

            // Return user data without password and token
            const { hashedPassword: _, ...userWithoutPassword } = newUser;
            return {
                token,
                user: userWithoutPassword
            };
        } catch (error) {
            console.error('Registration error:', error);
            return { error: 'Failed to register user' };
        }
    },

    // Get current user by using the token
    async getCurrentUser(token: string){
        const payload = verifyToken(token);
        if(!payload) return null;

        const user = await prisma.users.findUnique({
            where: { id: payload.userId },
            include: {
                _count: {
                    select: {
                        games: true,
                        ownedNFTs: true,
                    }
                }
            }
        });

        if(!user) return null;

        const { hashedPassword: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    },

    // Change user password
    async changePassword(userId: string, newPassword: string, currentPassword?: string) {
        
        const user = await prisma.users.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return { success: false, message: 'User not found' };
        }

        if (currentPassword && !verifyPassword(currentPassword, user.hashedPassword)) {
            return { success: false, message: 'Current password is incorrect' };
        }

        const hashedPassword = hashPassword(newPassword);
        await prisma.users.update({
            where: { id: userId },
            data: { hashedPassword }
        });

        return { success: true, message: 'Password updated successfully' };
    }
}