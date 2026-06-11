import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { csvToNormalizedContacts } from '@/lib/connectors/csv/parser';
import {
  buildContactIndex,
  resolveBatch,
  type ContactIdentity,
  type MatchKey,
  type ReviewReason,
} from '@/lib/connectors/ingest/identity';

/**
 * CSV import PREVIEW (dry-run). Composes the CSV adapter + the identity-resolution
 * engine against the workspace's LIVE members and returns what an import WOULD do —
 * how many contacts create, match an existing member, or need operator review —
 * WITHOUT writing anything. The persisting import route is added in the Contact-spine
 * schema window; this preview is unblocked because it only READS existing members.
 *
 * STAFF+ (READ_ONLY operators cannot run it). Reads are workspace-scoped; the index
 * is built only from this workspace's non-merged members, so cross-tenant identities
 * can never match. No DB writes.
 */

// Bound the per-row detail in the response; counts below are always exact.
const ROW_DETAIL_CAP = 500;
const SKIP_DETAIL_CAP = 100;
// Reject obviously oversized payloads before parsing (defensive; ~5MB of CSV text).
const MAX_CSV_CHARS = 5_000_000;

type PreviewRow = {
  externalId: string;
  name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  decision: 'create' | 'match' | 'review';
  matchedContact?: { id: string; name: string } | null;
  reason?: ReviewReason;
  candidates?: { id: string; name: string; key: MatchKey }[];
  identityless?: boolean;
};

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const body = await req.json().catch(() => null);
  const csv = body && typeof body.csv === 'string' ? body.csv : null;
  if (!csv) {
    return NextResponse.json({ error: 'Provide CSV text in the "csv" field.' }, { status: 400 });
  }
  if (csv.length > MAX_CSV_CHARS) {
    return NextResponse.json(
      { error: 'CSV is too large to preview (5MB limit).' },
      { status: 413 },
    );
  }

  const parsed = csvToNormalizedContacts(csv);
  if (parsed.totalRows === 0) {
    return NextResponse.json(
      { error: 'No data rows found. The first row must be a header.' },
      { status: 400 },
    );
  }

  // Build the identity index from this workspace's live (non-merged) members. Read-only.
  const members = await db.member.findMany({
    where: { workspaceId, mergedIntoId: null },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, instagram: true },
  });
  const nameById = new Map<string, string>();
  const identities: ContactIdentity[] = members.map((m) => {
    nameById.set(m.id, `${m.firstName} ${m.lastName}`.trim());
    return { contactId: m.id, email: m.email, phone: m.phone, instagram: m.instagram };
  });
  const index = buildContactIndex(identities);

  const decisions = resolveBatch(parsed.contacts, index);

  // A provisional id refers to an earlier row in THIS batch (a not-yet-created contact).
  const displayName = (id: string): string =>
    id.startsWith('provisional:') ? '(new — earlier in this file)' : nameById.get(id) ?? '(unknown)';

  let create = 0;
  let match = 0;
  let review = 0;
  let identityless = 0;
  const reviewByReason: Record<ReviewReason, number> = {
    soft_match: 0,
    conflicting_identity: 0,
    ambiguous: 0,
  };
  const rows: PreviewRow[] = [];

  decisions.forEach((decision, i) => {
    const c = parsed.contacts[i];
    const base = {
      externalId: c.externalId,
      name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '(no name)',
      email: c.emailRaw ?? c.email ?? null,
      phone: c.phone ?? null,
      instagram: c.instagram ?? null,
    };

    let row: PreviewRow;
    if (decision.kind === 'match') {
      match++;
      row = {
        ...base,
        decision: 'match',
        matchedContact: { id: decision.contactId, name: displayName(decision.contactId) },
      };
    } else if (decision.kind === 'review') {
      review++;
      reviewByReason[decision.reason]++;
      row = {
        ...base,
        decision: 'review',
        reason: decision.reason,
        candidates: decision.candidates.map((h) => ({
          id: h.contactId,
          name: displayName(h.contactId),
          key: h.key,
        })),
      };
    } else {
      create++;
      if (decision.identityKeyCount === 0) {
        identityless++;
        row = { ...base, decision: 'create', identityless: true };
      } else {
        row = { ...base, decision: 'create' };
      }
    }
    if (rows.length < ROW_DETAIL_CAP) rows.push(row);
  });

  return NextResponse.json({
    ok: true,
    summary: {
      totalRows: parsed.totalRows,
      parsed: parsed.contacts.length,
      skipped: parsed.skipped.length,
      create,
      match,
      review,
      reviewByReason,
      identityless,
    },
    unmappedHeaders: parsed.unmappedHeaders,
    rows,
    rowsTruncated: parsed.contacts.length > ROW_DETAIL_CAP,
    skippedRows: parsed.skipped.slice(0, SKIP_DETAIL_CAP),
  });
}
