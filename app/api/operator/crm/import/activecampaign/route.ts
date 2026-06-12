import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import {
  activeCampaignClientFromEnv,
  ActiveCampaignClientError,
} from '@/lib/connectors/activecampaign/client';
import { contactToNormalizedContact } from '@/lib/connectors/activecampaign/transform';
import {
  ingestNormalizedContacts,
  isSchemaNotApplied,
  SCHEMA_NOT_APPLIED_MESSAGE,
} from '@/lib/connectors/ingest/run';

/**
 * ActiveCampaign contact ingestion. Pulls every contact (offset-paged), maps each to a
 * NormalizedContact (subscriber role), and runs the same resolve → plan → persist
 * pipeline as the other imports.
 *
 * STAFF+, workspace-scoped. Disabled (400) until the connector env is set; gated on the
 * Contact-spine schema window (503) until the DB is migrated.
 */
export async function POST() {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const client = activeCampaignClientFromEnv();
  if (!client) {
    return NextResponse.json(
      {
        error:
          'ActiveCampaign connector is not configured. Set ACTIVECAMPAIGN_API_URL and ACTIVECAMPAIGN_API_TOKEN.',
      },
      { status: 400 },
    );
  }

  let contacts;
  try {
    const acContacts = await client.fetchAllContacts();
    const fetchedAt = new Date();
    contacts = acContacts.map((c) => contactToNormalizedContact(c, fetchedAt));
  } catch (error) {
    if (error instanceof ActiveCampaignClientError) {
      return NextResponse.json({ error: `ActiveCampaign fetch failed: ${error.message}` }, { status: 502 });
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
      source: 'activecampaign',
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
