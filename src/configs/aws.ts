import { S3Client } from '@aws-sdk/client-s3';

// Configure the S3 client
export const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

// S3 bucket name
export const bucketName = process.env.AWS_S3_BUCKET_NAME || 'vietnamese-chess-avatars';