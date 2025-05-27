import { FastifyRequest, FastifyReply } from 'fastify';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { s3Client, bucketName } from '../configs/aws';
import { userService } from '../services/user.service';

export const uploadController = {
    async uploadAvatar(
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
    ) {
        // Set up a request timeout to prevent hanging
        const requestTimeout = setTimeout(() => {
            request.log.error('Avatar upload timed out');
            reply.status(504).send({ message: 'Request timed out' });
        }, 25000); // 25 second timeout

        try {
            // Check if user exists
            const { id } = request.params;
            const user = await userService.getUserById(id);

            if (!user) {
                clearTimeout(requestTimeout);
                return reply.code(404).send({ message: 'User not found' });
            }

            // Get the file from the multipart request
            const data = await request.file();
            if (!data) {
                clearTimeout(requestTimeout);
                return reply.code(400).send({ message: 'No file uploaded' });
            }

            // Validate file mimetype
            const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/svg+xml'];
            if (!allowedTypes.includes(data.mimetype)) {
                clearTimeout(requestTimeout);
                return reply.code(400).send({
                    message: 'Invalid file type. Only JPEG, PNG, JPG, WebP, and SVG formats are allowed.'
                });
            }

            // Read the file into a buffer
            const buffer = await data.toBuffer();

            // Check file size (max 5MB)
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (buffer.length > maxSize) {
                clearTimeout(requestTimeout);
                return reply.code(400).send({ message: 'File too large. Maximum size is 5MB.' });
            }

            // Generate unique filename with extension
            const fileExtension = data.filename.split('.').pop() || 'jpg';
            const key = `avatars/${uuidv4()}.${fileExtension}`;

            // Delete old avatar if exists
            if (user.avatarUrl) {
                try {
                    // Extract the key from the URL
                    // Assuming URL format like https://bucket.region.amazonaws.com/avatars/filename.ext
                    const oldKey = user.avatarUrl.split('/').slice(-2).join('/'); // "avatars/filename.ext"

                    // Delete old avatar
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: bucketName,
                        Key: oldKey,
                    }));
                    request.log.info(`Deleted old avatar: ${oldKey}`);
                } catch (error) {
                    // Log but continue if delete fails
                    request.log.error(`Failed to delete old avatar: ${error}`);
                }
            }

            // Upload to S3
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: buffer,
                ContentType: data.mimetype,
            }));

            // Construct the avatar URL
            const avatarUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${key}`;

            // Update user profile with new avatar URL
            const updatedUser = await userService.updateProfile(id, { avatarUrl });

            if (!updatedUser) {
                clearTimeout(requestTimeout);
                return reply.code(404).send({ message: 'Failed to update user with new avatar' });
            }

            clearTimeout(requestTimeout);
            return reply.code(200).send({
                message: 'Avatar uploaded successfully',
                avatarUrl,
                user: updatedUser
            });
        } catch (error) {
            clearTimeout(requestTimeout);
            request.log.error(error);
            return reply.code(500).send({
                message: 'Failed to upload avatar',
                error: (error instanceof Error) ? error.message : 'Unknown error'
            });
        }
    },

    async deleteAvatar(
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
    ) {
        try {
            // Get user to check if they have an avatar
            const { id } = request.params;
            const user = await userService.getUserById(id);

            if (!user) {
                return reply.code(404).send({ message: 'User not found' });
            }

            if (!user.avatarUrl) {
                return reply.code(400).send({ message: 'User does not have an avatar' });
            }

            // Extract the key from the URL
            const key = user.avatarUrl.split('/').slice(-2).join('/'); // "avatars/filename.ext"

            // Delete from S3
            await s3Client.send(new DeleteObjectCommand({
                Bucket: bucketName,
                Key: key,
            }));

            // Update user profile to remove avatar URL (using empty string instead of null)
            const updatedUser = await userService.updateProfile(id, { avatarUrl: "" });

            return reply.code(200).send({
                message: 'Avatar deleted successfully',
                user: updatedUser
            });
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({
                message: 'Failed to delete avatar',
                error: (error instanceof Error) ? error.message : 'Unknown error'
            });
        }
    }
};