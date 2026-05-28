/**
 * DAM storage — Cloudflare R2 (private bucket, signed URLs).
 *
 * Mirrors the R2 client config in lib/r2-presign.ts and reuses the same
 * R2_EVENT_MEDIA_BUCKET with a `dam/{workspaceId}/` key prefix. Assets are NEVER
 * public: the app mints short-lived signed GET URLs at render time (15 min for
 * display, 24 hr for downloads). Self-contained client so the legacy event-hero
 * path stays untouched.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Signed-URL TTLs (seconds). */
export const DISPLAY_URL_TTL = 15 * 60; // 15 minutes — grid + preview display
export const DOWNLOAD_URL_TTL = 24 * 60 * 60; // 24 hours — downloads

let cachedClient: S3Client | null | undefined;

function bucket(): string | null {
  return process.env.R2_EVENT_MEDIA_BUCKET ?? null;
}

function s3Client(): S3Client | null {
  if (cachedClient !== undefined) return cachedClient;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket()) {
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

/** True when R2 credentials + bucket are configured. */
export function isStorageConfigured(): boolean {
  return s3Client() !== null;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      'R2 storage not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_EVENT_MEDIA_BUCKET)',
    );
    this.name = 'StorageNotConfiguredError';
  }
}

/** Workspace-scoped object key for a DAM asset. */
export function damKey(workspaceId: string, assetId: string, name: string): string {
  return `dam/${workspaceId}/${assetId}/${name}`;
}

/** Upload bytes to a private R2 object. Throws StorageNotConfiguredError when unconfigured. */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const client = s3Client();
  const b = bucket();
  if (!client || !b) throw new StorageNotConfiguredError();
  await client.send(
    new PutObjectCommand({ Bucket: b, Key: key, Body: body, ContentType: contentType }),
  );
}

/**
 * Short-lived signed GET URL for a private DAM object. Returns null when storage
 * is unconfigured or the key is empty (callers render a placeholder).
 *
 * Optionally sets `Content-Disposition` on the response so the browser
 * downloads the file instead of displaying it inline — used by the public
 * share download endpoint (the `download` HTML attribute can't force a save on
 * cross-origin R2 URLs).
 */
export async function presignGet(
  key: string,
  expiresSeconds: number = DISPLAY_URL_TTL,
  opts: { downloadFilename?: string } = {},
): Promise<string | null> {
  const client = s3Client();
  const b = bucket();
  if (!client || !b || !key.trim()) return null;
  try {
    const cmd = new GetObjectCommand({
      Bucket: b,
      Key: key.trim(),
      ...(opts.downloadFilename
        ? { ResponseContentDisposition: `attachment; filename="${sanitizeFilename(opts.downloadFilename)}"` }
        : {}),
    });
    return await getSignedUrl(client, cmd, { expiresIn: expiresSeconds });
  } catch {
    return null;
  }
}

/** Strip characters that would break a Content-Disposition header. ASCII-safe. */
function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, '_').slice(0, 200);
}

/** Delete a private R2 object (permanent-delete path). No-op when unconfigured/empty. */
export async function deleteObject(key: string): Promise<void> {
  const client = s3Client();
  const b = bucket();
  if (!client || !b || !key.trim()) return;
  await client.send(new DeleteObjectCommand({ Bucket: b, Key: key.trim() }));
}
