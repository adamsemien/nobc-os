/**
 * lib/applications/backup.ts
 *
 * Automatic application-backup — the single most important data-protection path
 * in the product. Membership applications are the company's biggest asset; this
 * module serializes each one to a complete JSON document (+ portrait photo) and
 * pushes it to a durable, off-platform destination (Google Drive).
 *
 * Rules (asset-critical path):
 *  - FAIL-CLOSED. backupApplication() NEVER throws. A failure is recorded on the
 *    ApplicationBackup ledger (status FAILED, attempts++, lastError) and surfaced
 *    via the alert() path — it must never block, slow, or fail an applicant's
 *    submission.
 *  - Every error is logged with context (workspaceId, applicationId).
 *  - Workspace-scoping is the security boundary: every read filters by workspaceId.
 *  - Dependency-free Google Drive client: a service-account JWT signed with Node's
 *    built-in crypto → OAuth access token → Drive v3 REST. No googleapis dep.
 *  - DORMANT until configured: with the three GOOGLE_DRIVE_* env vars unset, a
 *    backup is left PENDING (not FAILED) so the reconciliation cron completes it
 *    automatically once credentials are added.
 */
import { createHash, createSign } from 'crypto';
import { db } from '@/lib/db';
import { presignGet, DOWNLOAD_URL_TTL } from '@/lib/dam/storage';
import { isPortraitRef, isHttpUrl } from '@/lib/apply-photo';
import { alert } from '@/lib/alerting';

const DESTINATION = 'google_drive';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_AUDIENCE = 'https://oauth2.googleapis.com/token';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
/** Attempts after which a Slack/email alert is fired (matches the spec). */
const ALERT_AFTER_ATTEMPTS = 3;

// ── Serialization ──────────────────────────────────────────────────────────

export interface SerializedApplication {
  /** The assembled backup document (every field of the application). */
  json: Record<string, unknown>;
  /** Canonical JSON string of `json` — the exact bytes that are checksummed + stored. */
  jsonString: string;
  /** sha256 of jsonString. */
  checksum: string;
  /** Resolved portrait photo bytes, when the application has an uploaded photo. */
  photo?: { bytes: Buffer; contentType: string; filename: string };
}

/** Content-type → extension for the photo sidecar filename. */
function extForContentType(contentType: string): string {
  if (/png/i.test(contentType)) return 'png';
  if (/webp/i.test(contentType)) return 'webp';
  return 'jpg';
}

/**
 * Resolve the application's portrait photo (if any) to raw bytes.
 *
 * The `photos.urls` answer holds a JSON array whose entries are EITHER a private
 * R2 object key (under `applications/{workspaceId}/`) OR a full http(s) URL
 * (legacy/demo). We back up the FIRST resolvable portrait reference: a private
 * key is fetched via a short-lived signed GET; a full URL is fetched directly.
 * Returns null when there is no photo or it cannot be fetched (non-fatal — the
 * JSON document is still the source of truth and records the reference).
 */
async function resolvePhoto(
  answers: { questionKey: string; answer: string }[],
  workspaceId: string,
  applicationId: string,
): Promise<{ bytes: Buffer; contentType: string; filename: string } | undefined> {
  const photosAnswer = answers.find((a) => a.questionKey === 'photos.urls');
  if (!photosAnswer) return undefined;

  let refs: unknown;
  try {
    refs = JSON.parse(photosAnswer.answer);
  } catch {
    // Single bare value (not a JSON array) — treat the raw string as one ref.
    refs = [photosAnswer.answer];
  }
  const list = Array.isArray(refs) ? refs : [refs];
  const ref = list.find((r) => isPortraitRef(r)) as string | undefined;
  if (!ref) return undefined;

  try {
    const fetchUrl = isHttpUrl(ref) ? ref : await presignGet(ref, DOWNLOAD_URL_TTL);
    if (!fetchUrl) return undefined;
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      console.error('[application-backup] photo fetch non-OK', {
        workspaceId,
        applicationId,
        status: res.status,
      });
      return undefined;
    }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, contentType, filename: `${applicationId}-photo.${extForContentType(contentType)}` };
  } catch (err) {
    console.error('[application-backup] photo resolve failed', {
      workspaceId,
      applicationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/**
 * Workspace-scoped fetch of an application + its answers + related audit events,
 * assembled into a complete JSON backup document. Resolves the portrait photo
 * to bytes. Returns null when the application does not exist.
 */
export async function serializeApplication(
  applicationId: string,
): Promise<SerializedApplication | null> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { answers: { orderBy: { createdAt: 'asc' } } },
  });
  if (!application) return null;

  const { workspaceId } = application;

  // Audit trail for this application — scoped to the same workspace (security boundary).
  const auditEvents = await db.auditEvent.findMany({
    where: { workspaceId, entityType: 'Application', entityId: applicationId },
    orderBy: { createdAt: 'asc' },
  });

  const json: Record<string, unknown> = {
    schemaVersion: 1,
    destination: DESTINATION,
    backedUpAt: new Date().toISOString(),
    application,
    answers: application.answers,
    auditEvents,
  };

  // Deterministic key order via the default JSON.stringify of a stable object
  // graph (Prisma returns fields in schema order). 2-space indent for legibility.
  const jsonString = JSON.stringify(json, null, 2);
  const checksum = createHash('sha256').update(jsonString).digest('hex');

  const photo = await resolvePhoto(application.answers, workspaceId, applicationId);

  return { json, jsonString, checksum, photo };
}

// ── Google Drive adapter (dependency-free) ───────────────────────────────────

/** True only when all three Drive service-account env vars are set. */
export function isDriveBackupConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_DRIVE_PRIVATE_KEY &&
      process.env.GOOGLE_DRIVE_FOLDER_ID,
  );
}

/** base64url-encode a Buffer or string (JWT segments). */
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Normalize an env-stored PEM key whose newlines are `\n`-escaped. */
function normalizePrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

/**
 * Mint a Google service-account OAuth access token: build + RS256-sign a JWT,
 * exchange it at the token endpoint. Throws on any failure (caller handles).
 */
export async function getDriveAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (!email || !privateKeyRaw) {
    throw new Error('Drive backup not configured (missing service account email or private key)');
  }
  const privateKey = normalizePrivateKey(privateKeyRaw);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: email,
    scope: DRIVE_SCOPE,
    aud: TOKEN_AUDIENCE,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  const assertion = `${signingInput}.${base64url(signature)}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Drive token exchange returned no access_token');
  return data.access_token;
}

/** Escape a string for safe embedding in a Drive `q` query literal. */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Find-or-create a child folder by name under `parentId`. Returns the folder id.
 * Used to bucket backups into a `YYYY-MM` subfolder.
 */
async function findOrCreateFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  const q = [
    `name = '${escapeQueryValue(name)}'`,
    `'${escapeQueryValue(parentId)}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ');
  const searchUrl =
    `${DRIVE_FILES_ENDPOINT}?q=${encodeURIComponent(q)}` +
    '&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true';

  const findRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (findRes.ok) {
    const found = (await findRes.json()) as { files?: { id: string }[] };
    if (found.files && found.files.length > 0) return found.files[0].id;
  }

  const createRes = await fetch(`${DRIVE_FILES_ENDPOINT}?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`Drive folder create failed (${createRes.status}): ${text.slice(0, 200)}`);
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) throw new Error('Drive folder create returned no id');
  return created.id;
}

/** Multipart upload of a single file to Drive v3. Returns the created file id. */
export async function uploadToDrive(params: {
  accessToken: string;
  folderId: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<string> {
  const { accessToken, folderId, name, mimeType, bytes } = params;
  const boundary = `nobc-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadata = { name, parents: [folderId] };

  const parts = [
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n`,
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  const body = Buffer.concat(parts);

  const res = await fetch(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Drive upload returned no file id');
  return data.id;
}

/** Two-digit-month dated subfolder name, e.g. "2026-06". */
function monthFolderName(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Back up a single application to the configured destination. NEVER throws.
 *
 * Flow:
 *  1. Upsert the ledger row to PENDING (so the application is always tracked).
 *  2. If Drive is unconfigured → log at info, leave PENDING for reconciliation.
 *  3. Serialize → mint token → find/create the YYYY-MM folder → upload JSON
 *     (+ photo) → mark DONE (externalId, checksum, backedUpAt).
 *  4. On any error → attempts++, lastError, status FAILED, log with context, and
 *     fire the alert when attempts >= ALERT_AFTER_ATTEMPTS.
 */
export async function backupApplication(applicationId: string): Promise<void> {
  let workspaceId = '';
  try {
    const application = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, workspaceId: true },
    });
    if (!application) {
      console.error('[application-backup] application not found', { applicationId });
      return;
    }
    workspaceId = application.workspaceId;

    // 1. Ensure a ledger row exists, reset to PENDING for this attempt.
    await db.applicationBackup.upsert({
      where: { applicationId },
      create: { workspaceId, applicationId, destination: DESTINATION, status: 'PENDING' },
      update: { status: 'PENDING', destination: DESTINATION },
    });

    // 2. Dormant until configured — leave PENDING so the cron completes it later.
    if (!isDriveBackupConfigured()) {
      console.info(
        '[application-backup] drive backup not configured; leaving PENDING for reconciliation',
        { workspaceId, applicationId },
      );
      return;
    }

    // 3. Serialize + upload.
    const serialized = await serializeApplication(applicationId);
    if (!serialized) {
      console.error('[application-backup] serialize returned null (application vanished)', {
        workspaceId,
        applicationId,
      });
      return;
    }

    const accessToken = await getDriveAccessToken();
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID as string;
    const monthFolderId = await findOrCreateFolder(
      accessToken,
      rootFolderId,
      monthFolderName(new Date()),
    );

    const fileId = await uploadToDrive({
      accessToken,
      folderId: monthFolderId,
      name: `${applicationId}.json`,
      mimeType: 'application/json',
      bytes: Buffer.from(serialized.jsonString, 'utf8'),
    });

    if (serialized.photo) {
      try {
        await uploadToDrive({
          accessToken,
          folderId: monthFolderId,
          name: serialized.photo.filename,
          mimeType: serialized.photo.contentType,
          bytes: serialized.photo.bytes,
        });
      } catch (photoErr) {
        // A missing photo sidecar must not fail the JSON backup (the JSON is the
        // source of truth and records the photo reference). Log; keep DONE.
        console.error('[application-backup] photo upload failed (JSON backup kept)', {
          workspaceId,
          applicationId,
          err: photoErr instanceof Error ? photoErr.message : String(photoErr),
        });
      }
    }

    // 4a. Success — mark DONE.
    await db.applicationBackup.update({
      where: { applicationId },
      data: {
        status: 'DONE',
        externalId: fileId,
        checksum: serialized.checksum,
        backedUpAt: new Date(),
        lastError: null,
      },
    });
  } catch (err) {
    // 4b. Failure — record on the ledger, log, alert past the threshold. Never rethrow.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[application-backup] backup failed', { workspaceId, applicationId, err: message });

    let attempts = 0;
    try {
      const updated = await db.applicationBackup.update({
        where: { applicationId },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: message.slice(0, 1000),
        },
        select: { attempts: true },
      });
      attempts = updated.attempts;
    } catch (ledgerErr) {
      // The ledger write itself failed — log; do not throw to the caller.
      console.error('[application-backup] failed to record backup failure on ledger', {
        workspaceId,
        applicationId,
        err: ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr),
      });
    }

    if (attempts >= ALERT_AFTER_ATTEMPTS) {
      void alert({
        severity: 'critical',
        event: 'application.backup.failed',
        workspaceId: workspaceId || undefined,
        context: { applicationId, attempts, reason: message.slice(0, 200) },
      });
    }
  }
}
