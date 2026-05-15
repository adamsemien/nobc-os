import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let cachedClient: S3Client | null | undefined;

function s3Client(): S3Client | null {
  if (cachedClient !== undefined) return cachedClient;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_EVENT_MEDIA_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    cachedClient = null;
    return null;
  }
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

/** Short-lived GET URL for private R2 objects (event hero). */
export async function presignEventHeroGet(objectKey: string, expiresSeconds = 3600): Promise<string | null> {
  const client = s3Client();
  const bucket = process.env.R2_EVENT_MEDIA_BUCKET;
  if (!client || !bucket || !objectKey.trim()) return null;
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: objectKey.trim() });
    return await getSignedUrl(client, cmd, { expiresIn: expiresSeconds });
  } catch {
    return null;
  }
}
