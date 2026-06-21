import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { producerClientFromEnv, ProducerClientError } from '@/lib/connectors/producer/client';
import { vendorToNormalizedContact } from '@/lib/connectors/producer/transform';
import {
  ingestNormalizedContacts,
  isSchemaNotApplied,
  SCHEMA_NOT_APPLIED_MESSAGE,
} from '@/lib/connectors/ingest/run';

/**
 * Producer vendor ingestion. Pulls the Producer CRM export (HMAC-signed, cursor-paged),
 * maps each DirectoryCompany(Vendor) → NormalizedContact, and runs the same resolve →
 * plan → persist pipeline as the CSV import: vendors with a contact email become Members
 * (vendor role + a `producer` ContactSource); the rest defer.
 *
 * STAFF+, workspace-scoped. Disabled (400) until the connector env is set; gated on the
 * Contact-spine schema window (503) until the DB is migrated.
 */
export async function POST() {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const client = producerClientFromEnv();
  if (!client) {
    return NextResponse.json(
      {
        error:
          'Producer connector is not configured. Set PRODUCER_CRM_EXPORT_URL and NOBC_OS_WEBHOOK_SECRET.',
      },
      { status: 400 },
    );
  }

  let contacts;
  try {
    const vendors = await client.fetchAllVendors();
    const fetchedAt = new Date();
    contacts = vendors.map((v) => vendorToNormalizedContact(v, fetchedAt));
  } catch (error) {
    if (error instanceof ProducerClientError) {
      return NextResponse.json(
        { error: `Producer export failed: ${error.message}` },
        { status: 502 },
      );
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
      source: 'producer',
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
