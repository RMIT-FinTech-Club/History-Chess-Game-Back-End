import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { UserService } from '../services/user.service';
import { v4 as uuidv4 } from 'uuid';

export interface AvatarRequest {
  Params: { id: string };
  Headers: { authorization?: string };
  authUser?: { id: string; username: string; googleAuth: boolean };
}

export const uploadController = {
  async uploadAvatar(
    request: FastifyRequest<AvatarRequest>,
    reply: FastifyReply,
    fastify: FastifyInstance
  ): Promise<void> {
    try {
      const userId = request.authUser?.id;
      request.log.info(`Avatar upload attempt: userId=${userId}, params.id=${request.params.id}, user=${JSON.stringify(request.authUser)}, authHeader=${request.headers.authorization}`);
      if (!userId || userId !== request.params.id) {
        request.log.warn(`Unauthorized avatar upload: userId=${userId}, params.id=${request.params.id}`);
        reply.status(401).send({ message: 'Unauthorized' });
        return;
      }

      const data = await request.file();
      if (!data) {
        reply.status(400).send({ message: 'No file uploaded' });
        return;
      }

      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
      if (!validTypes.includes(data.mimetype)) {
        reply.status(400).send({ message: 'Invalid file type. Only JPEG, PNG, WEBP, or SVG allowed.' });
        return;
      }

      if (data.file.bytesRead > 5 * 1024 * 1024) {
        reply.status(400).send({ message: 'File size exceeds 5MB limit' });
        return;
      }

      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'ap-southeast-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });

      const userService = new UserService(fastify);
      const userResult = await userService.getUserById(userId);
      if (!userResult) {
        reply.status(404).send({ message: 'User not found' });
        return;
      }
      const { data: user } = userResult;

      if (user.avatarUrl) {
        const oldKey = user.avatarUrl.split('/').pop();
        if (oldKey) {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME || 'fintech-club-vietnamese-historical-chess-game',
            Key: `avatars/${oldKey}`,
          }));
          request.log.info(`Deleted old avatar: avatars/${oldKey}`);
        }
      }

      const fileExtension = data.mimetype.split('/')[1];
      const fileName = `${uuidv4()}.${fileExtension}`;
      const fileBuffer = await data.toBuffer();

      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME || 'fintech-club-vietnamese-historical-chess-game',
        Key: `avatars/${fileName}`,
        Body: fileBuffer,
        ContentType: data.mimetype,
      }));
      request.log.info(`Uploaded avatar: avatars/${fileName} via bucket policy`);

      const avatarUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/avatars/${fileName}`;
      request.log.info(`Generated avatar URL: ${avatarUrl}`);

      const updatedUserResult = await userService.updateProfile(userId, { avatarUrl });
      if (!updatedUserResult) {
        reply.status(404).send({ message: 'User not found' });
        return;
      }
      const { token, data: updatedUser } = updatedUserResult;

      reply.status(200).send({ message: 'Avatar uploaded successfully', avatarUrl, token, user: updatedUser });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      request.log.error(`S3 upload error: ${message}, code=${error instanceof Error && 'code' in error ? error.code : undefined}, requestId=${error instanceof Error && 'requestId' in error ? error.requestId : undefined}`);
      reply.status(500).send({ 
        message: `S3 upload failed: ${message}` 
      });
    }
  },

  async deleteAvatar(
    request: FastifyRequest<AvatarRequest>,
    reply: FastifyReply,
    fastify: FastifyInstance
  ): Promise<void> {
    try {
      const userId = request.authUser?.id;
      request.log.info(`Avatar delete attempt: userId=${userId}, params.id=${request.params.id}, user=${JSON.stringify(request.authUser)}, authHeader=${request.headers.authorization}`);
      if (!userId || userId !== request.params.id) {
        request.log.warn(`Unauthorized avatar delete: userId=${userId}, params.id=${request.params.id}`);
        reply.status(401).send({ message: 'Unauthorized' });
        return;
      }

      const userService = new UserService(fastify);
      const userResult = await userService.getUserById(userId);
      if (!userResult) {
        reply.status(404).send({ message: 'User not found' });
        return;
      }
      const { data: user } = userResult;

      if (user.avatarUrl) {
        const oldKey = user.avatarUrl.split('/').pop();
        if (oldKey) {
          const s3Client = new S3Client({
            region: process.env.AWS_REGION || 'ap-southeast-2',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
          });

          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME || 'fintech-club-vietnamese-historical-chess-game',
            Key: `avatars/${oldKey}`,
          }));
          request.log.info(`Deleted avatar: avatars/${oldKey}`);
        }
      }

      const updatedUserResult = await userService.updateProfile(userId, { avatarUrl: null });
      if (!updatedUserResult) {
        reply.status(404).send({ message: 'User not found' });
        return;
      }
      const { token, data: updatedUser } = updatedUserResult;

      reply.status(200).send({ message: 'Avatar deleted successfully', token, user: updatedUser });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      request.log.error(`Delete avatar error: ${message}`);
      reply.status(500).send({ message: 'Internal server error' });
    }
  },
};