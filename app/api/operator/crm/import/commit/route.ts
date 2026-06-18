import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { csvToNormalizedContacts } from '@/lib/connectors/csv/parser';
import {
  ingestNormalizedContacts,
  isSchemaNotApplied,
  SCHEMA_NOT_APPLIED_MESSAGE,
} from '@/lib/connectors/ingest/run';

/**
 * CSV import COMMIT — the persisting counterpart to /preview. Parses the CSV, resolves
 * each contact against the workspace's members, and writes Member + ContactSource rows
 * (creates for new email-bearing contacts, attaches a source onto matched members).
 * Review/no-email/unresolved contacts are deferred, never auto-written.
 *
 * STAFF+, workspace-scoped. Gated on the Contact-spine schema being applied (the DB
 * window) — returns 503 with guidance until then.
 */
const MAX_CSV_CHARS = 5_000_000;

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  const csv = body && typeof body.csv === 'string' ? body.csv : null;
  if (!csv) {
    return NextResponse.json({ error: 'Provide CSV text in the "csv" field.' }, { status: 400 });
  }
  if (csv.length > MAX_CSV_CHARS) {
    return NextResponse.json({ error: 'CSV is too large to import (5MB limit).' }, { status: 413 });
  }

  const parsed = csvToNormalizedContacts(csv);
  if (parsed.totalRows === 0) {
    return NextResponse.json(
      { error: 'No data rows found. The first row must be a header.' },
      { status: 400 },
    );
  }

  let plan, result;
  try {
    ({ plan, result } = await ingestNormalizedContacts(db, workspaceId, parsed.contacts));
  } catch (error) {
    if (isSchemaNotApplied(error)) {
      return NextResponse.json({ error: SCHEMA_NOT_APPLIED_MESSAGE }, { status: 503 });
    }
    throw error; // real failure — the route boundary logs it
  }

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'crm.import.committed',
    entityType: 'WORKSPACE',
    entityId: workspaceId,
    metadata: {
      source: 'csv',
      created: result.createdMemberIds.length,
      attached: result.attachedMemberIds.length,
      deferred: result.deferred,
      skipped: parsed.skipped.length,
    },
  });

  return NextResponse.json({
    ok: true,
    created: result.createdMemberIds.length,
    attached: result.attachedMemberIds.length,
    deferred: result.deferred,
    deferByReason: plan.summary.deferByReason,
    skipped: parsed.skipped.length,
  });
}
