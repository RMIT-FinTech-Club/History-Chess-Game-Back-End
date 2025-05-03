import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

export interface CreateUserInput {
    username: string;
    email: string;
    password: string;
    walletAddress?: string;
}

export interface UpdateUserInput {
    username?: string;
    email?: string;
    password?: string;
    walletAddress?: string;
}

export interface UpdateProfileInput {
    username?: string;
    email?: string;
    password?: string;
    walletAddress?: string;
}


// Utility function to hash passwords
const hashPassword = (password: string): string => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

export const userService = {
    // Create a new user
    async createUser(data: CreateUserInput) {
        const hashedPassword = hashPassword(data.password);
        
        const user = await prisma.users.create({
            data: {
                username: data.username,
                email: data.email,
                hashedPassword: hashedPassword,
                walletAddress: data.walletAddress,
            },
        });
        
        // Remove the hashed password from the response
        const { hashedPassword: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    },
    
    // Get a user by ID
    async getUserById(id: string) {
        const user = await prisma.users.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        games: true,
                        ownedNFTs: true,
                    },
                },
            },
        });
        
        if (!user) {
            return null;
        }
        
        // Remove the hashed password from the response
        const { hashedPassword: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    },
    
    // Get all users with pagination
    async getAllUsers(limit: number = 10, offset: number = 0) {
        const users = await prisma.users.findMany({
            skip: offset,
            take: limit,
            orderBy: {
                createdAt: 'desc',
            },
        });
        
        const total = await prisma.users.count();
        
        // Remove the hashed password from each user
        const usersWithoutPasswords = users.map((user) => {
            const { hashedPassword: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        
        return {
            users: usersWithoutPasswords,
            total,
            limit,
            offset,
        };
    },
    
    // Update a user
    async updateUser(id: string, data: UpdateUserInput) {
        // Prepare the update data
        const updateData: any = {};
        
        if (data.username) updateData.username = data.username;
        if (data.email) updateData.email = data.email;
        if (data.password) updateData.hashedPassword = hashPassword(data.password);
        if (data.walletAddress !== undefined) updateData.walletAddress = data.walletAddress;
        
        try {
            const updatedUser = await prisma.users.update({
                where: { id },
                data: updateData,
            });
            
            // Remove the hashed password from the response
            const { hashedPassword: _, ...userWithoutPassword } = updatedUser;
            return userWithoutPassword;
        } catch (error) {
            // User not found or unique constraint violation
            return null;
        }
    },

    async updateProfile(id: string, data: UpdateProfileInput) {
        // Prepare the update data
        const updateData: any = {};

        // Only update fields that are provided
        if (data.username) updateData.username = data.username;
        if (data.email) updateData.email = data.email;
        if (data.password) updateData.hashedPassword = hashPassword(data.password);
        if (data.walletAddress !== undefined) updateData.walletAddress = data.walletAddress;

        try {
            const updatedUser = await prisma.users.update({
                where: { id },
                data: updateData,
            });

            // Remove the hashed password from the response
            const { hashedPassword: _, ...userWithoutPassword } = updatedUser;
            return userWithoutPassword;
        } catch (error) {
            // User not found or unique constraint violation
            return null;
        }
    },
    
    // Delete a user
    async deleteUser(id: string) {
        try {
            await prisma.users.delete({
                where: { id },
            });
            return true;
        } catch (error) {
            return false;
        }
    },
};

// Flow of data: Routes (with Swagger schemas) → Controller → Service → Database