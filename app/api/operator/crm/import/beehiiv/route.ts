import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { beehiivClientFromEnv, BeehiivClientError } from '@/lib/connectors/beehiiv/client';
import { subscriptionToNormalizedContact } from '@/lib/connectors/beehiiv/transform';
import {
  ingestNormalizedContacts,
  isSchemaNotApplied,
  SCHEMA_NOT_APPLIED_MESSAGE,
} from '@/lib/connectors/ingest/run';

/**
 * beehiiv subscriber ingestion. Pulls every subscription (cursor-paged), maps each to a
 * NormalizedContact (subscriber role), and runs the same resolve → plan → persist
 * pipeline as the CSV/Producer imports: subscribers with an email become Members (+ a
 * `beehiiv` ContactSource); the rest defer.
 *
 * STAFF+, workspace-scoped. Disabled (400) until the connector env is set; gated on the
 * Contact-spine schema window (503) until the DB is migrated.
 */
export async function POST() {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const client = beehiivClientFromEnv();
  if (!client) {
    return NextResponse.json(
      { error: 'beehiiv connector is not configured. Set BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID.' },
      { status: 400 },
    );
  }

  let contacts;
  try {
    const subs = await client.fetchAllSubscriptions();
    const fetchedAt = new Date();
    contacts = subs.map((s) => subscriptionToNormalizedContact(s, fetchedAt));
  } catch (error) {
    if (error instanceof BeehiivClientError) {
      return NextResponse.json({ error: `beehiiv fetch failed: ${error.message}` }, { status: 502 });
    }
    throw error;
  }

  if (contacts.length === 0) {
    return NextResponse.json({ ok: true, fetched: 0, created: 0, attached: 0, deferred: 0 });
  }

  let plan, result;
  try {
    ({ plan, result } = await ingestNormalizedContacts(db, workspaceId, contacts));
  } catch (error) {
    if (isSchemaNotApplied(error)) {
      return NextResponse.json({ error: SCHEMA_NOT_APPLIED_MESSAGE }, { status: 503 });
    }
    throw error;
  }

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'crm.import.committed',
    entityType: 'WORKSPACE',
    entityId: workspaceId,
    metadata: {
      source: 'beehiiv',
      fetched: contacts.length,
      created: result.createdMemberIds.length,
      attached: result.attachedMemberIds.length,
      deferred: result.deferred,
    },
  });

  return NextResponse.json({
    ok: true,
    fetched: contacts.length,
    created: result.createdMemberIds.length,
    attached: result.attachedMemberIds.length,
    deferred: result.deferred,
    deferByReason: plan.summary.deferByReason,
  });
}
