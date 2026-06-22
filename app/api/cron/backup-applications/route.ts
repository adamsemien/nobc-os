import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { backupApplication, isDriveBackupConfigured } from '@/lib/applications/backup';

/** Reconciliation cron — backs up any application not yet durably backed up.
 *
 *  Membership applications are the company's most critical data asset. The
 *  write-through hook on submit handles the happy path; this hourly cron is the
 *  safety net that catches everything else: drafts, abandoned submissions, and
 *  write-throughs that failed (e.g. Drive creds added after the fact).
 *
 *  Selection (bounded to BATCH per run):
 *   - Applications with NO ApplicationBackup row, OR whose row is not DONE
 *     (PENDING / FAILED), where FAILED rows are retried only while attempts < 5.
 *  backupApplication() is fail-closed and never throws.
 *
 *  Auth: header `x-vercel-cron-secret` (or `Authorization: Bearer …`, or
 *  `?secret=`) must match `CRON_SECRET`. Vercel sets the header automatically;
 *  manual invocations pass it explicitly. Mirrors the event-reminders cron.
 */

const BATCH = 50;
const MAX_FAILED_ATTEMPTS = 5;

export async function GET(req: NextRequest) {
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.headers.get('x-vercel-cron-secret') ??
    req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Applications still needing a durable backup: no row, or a non-DONE row. FAILED
  // rows are retried only while under the attempt ceiling so a permanently-broken
  // application can't monopolize every batch.
  const applications = await db.application.findMany({
    where: {
      OR: [
        { backup: null },
        { backup: { status: 'PENDING' } },
        { backup: { status: 'FAILED', attempts: { lt: MAX_FAILED_ATTEMPTS } } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });

  let done = 0;
  let failed = 0;
  let skippedUnconfigured = 0;
  const configured = isDriveBackupConfigured();

  for (const app of applications) {
    if (!configured) {
      // Dormant: backupApplication leaves these PENDING. Count them as skipped
      // rather than hammering the loop with no-ops we already understand.
      skippedUnconfigured += 1;
      continue;
    }
    await backupApplication(app.id);
    // Re-read the ledger to classify the outcome for the summary.
    const row = await db.applicationBackup.findUnique({
      where: { applicationId: app.id },
      select: { status: true },
    });
    if (row?.status === 'DONE') done += 1;
    else failed += 1;
  }

  const summary = { processed: applications.length, done, failed, skippedUnconfigured };
  console.info('[backup-applications] reconciliation run', summary);
  return NextResponse.json(summary);
}
