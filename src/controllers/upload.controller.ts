import { FastifyRequest, FastifyReply } from 'fastify';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { s3Client, bucketName } from '../configs/aws';
import { UserService } from '../services/user.service';

export const uploadController = {
  async uploadAvatar(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const userService = new UserService(request.server);
    const requestTimeout = setTimeout(() => {
      request.log.error('Avatar upload timed out');
      reply.status(504).send({ message: 'Request timed out' });
    }, 25000);

    try {
      const { id } = request.params;
      const user = await userService.getUserById(id);

      if (!user) {
        clearTimeout(requestTimeout);
        return reply.code(404).send({ message: 'User not found' });
      }

      const data = await request.file();
      if (!data) {
        clearTimeout(requestTimeout);
        return reply.code(400).send({ message: 'No file uploaded' });
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/svg+xml'];
      if (!allowedTypes.includes(data.mimetype)) {
        clearTimeout(requestTimeout);
        return reply.code(400).send({
          message: 'Invalid file type. Only JPEG, PNG, JPG, WebP, and SVG formats are allowed.'
        });
      }

      const buffer = await data.toBuffer();
      const maxSize = 5 * 1024 * 1024;
      if (buffer.length > maxSize) {
        clearTimeout(requestTimeout);
        return reply.code(400).send({ message: 'File too large. Maximum size is 5MB.' });
      }

      const fileExtension = data.filename.split('.').pop() || 'jpg';
      const key = `avatars/${uuidv4()}.${fileExtension}`;

      if (user.avatarUrl) {
        try {
          const oldKey = user.avatarUrl.split('/').slice(-2).join('/');
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: oldKey,
          }));
          request.log.info(`Deleted old avatar: ${oldKey}`);
        } catch (error) {
          request.log.error(`Failed to delete old avatar: ${error}`);
        }
      }

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: data.mimetype,
      }));

      const avatarUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${key}`;
      const updatedUser = await userService.updateProfile(id, { avatarUrl });

      if (!updatedUser) {
        clearTimeout(requestTimeout);
        return reply.code(404).send({ message: 'Failed to update user with new avatar' });
      }

      clearTimeout(requestTimeout);
      return reply.code(200).send({
        message: 'Avatar uploaded successfully',
        avatarUrl,
        user: updatedUser,
      });
    } catch (error) {
      clearTimeout(requestTimeout);
      request.log.error(error);
      return reply.code(500).send({
        message: 'Failed to upload avatar',
        error: (error instanceof Error) ? error.message : 'Unknown error',
      });
    }
  },

  async deleteAvatar(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const userService = new UserService(request.server);
    try {
      const { id } = request.params;
      const user = await userService.getUserById(id);

      if (!user) {
        return reply.code(404).send({ message: 'User not found' });
      }

      if (!user.avatarUrl) {
        return reply.code(400).send({ message: 'User does not have an avatar' });
      }

      const key = user.avatarUrl.split('/').slice(-2).join('/');
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }));

      const updatedUser = await userService.updateProfile(id, { avatarUrl: "" });

      return reply.code(200).send({
        message: 'Avatar deleted successfully',
        user: updatedUser,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        message: 'Failed to delete avatar',
        error: (error instanceof Error) ? error.message : 'Unknown error',
      });
    }
  },
};