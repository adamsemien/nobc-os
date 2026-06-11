/** Ingestion pipeline glue — the one place that joins the pure pieces to the DB:
 *  build the identity index from a workspace's live members → resolve the batch →
 *  plan → execute. Shared by every source entry point (CSV commit, Producer ingest,
 *  future beehiiv/AC). Workspace-scoped throughout. */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { NormalizedContact } from '../types';
import { buildContactIndex, resolveBatch } from './identity';
import { planPersist, executePersist, type PersistPlan, type PersistResult } from './persist';

export async function ingestNormalizedContacts(
  db: PrismaClient,
  workspaceId: string,
  contacts: NormalizedContact[],
): Promise<{ plan: PersistPlan; result: PersistResult }> {
  // Index from this workspace's live (non-merged) members — read-only, workspace-scoped.
  const members = await db.member.findMany({
    where: { workspaceId, mergedIntoId: null },
    select: { id: true, email: true, phone: true, instagram: true },
  });
  const index = buildContactIndex(
    members.map((m) => ({ contactId: m.id, email: m.email, phone: m.phone, instagram: m.instagram })),
  );
  const decisions = resolveBatch(contacts, index);
  const plan = planPersist(contacts, decisions);
  const result = await executePersist(db, workspaceId, plan);
  return { plan, result };
}

/** True when the failure is "the Contact-spine schema isn't applied to this DB yet"
 *  (missing table P2021 / missing column P2022) — i.e. the coordinated DB window hasn't
 *  been run. Lets a route return a clean 503 instead of a 500 before the window. */
export function isSchemaNotApplied(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

export const SCHEMA_NOT_APPLIED_MESSAGE =
  'Contact-spine schema is not applied to the database yet. Run the DB window first ' +
  '(see _context/_audit/CONTACT-SPINE-DB-WINDOW.md), then retry.';
