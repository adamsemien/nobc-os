import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level coverage for the provenance write-path PATCH /api/operator/members/[id].
// Exercises the real handler with the real schema + applyFieldWrites; only the DB,
// the role gate, the audit emit, and module-load-only deps are mocked.

const m = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  emitEvent: vi.fn(),
}));
vi.mock('@/lib/operator-role', () => ({ requirePermission: m.requirePermission }));
vi.mock('@/lib/db', () => ({ db: { member: { findFirst: m.findFirst, update: m.update } } }));
vi.mock('@/lib/emit-event', () => ({ emitEvent: m.emitEvent }));
// Imported at module load by the GET handler; unused by PATCH but must resolve.
vi.mock('@/lib/auth', () => ({ requireWorkspaceId: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));

import { PATCH } from '@/app/api/operator/members/[id]/route';

const STAFF_GATE = { ok: true, userId: 'op1', workspaceId: 'w1', role: 'STAFF' };

function call(body: unknown, id = 'M') {
  return PATCH(
    { json: async () => body } as unknown as Parameters<typeof PATCH>[0],
    { params: Promise.resolve({ id }) } as unknown as Parameters<typeof PATCH>[1],
  );
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requirePermission.mockResolvedValue(STAFF_GATE);
  m.findFirst.mockResolvedValue({ id: 'M', customFields: null, fieldProvenance: null, mergedIntoId: null });
  m.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'M', ...data }),
  );
  m.emitEvent.mockResolvedValue(undefined);
});

describe('PATCH /api/operator/members/[id] — provenance write-path', () => {
  it('writes a custom field into customFields and stamps fieldProvenance', async () => {
    const res = await call({ fields: { vibe: { value: 'high', confidence: 0.9 } } });
    expect(res.status).toBe(200);

    const data = m.update.mock.calls[0][0].data;
    expect(data.customFields).toEqual({ vibe: 'high' });
    const prov = data.fieldProvenance.vibe;
    expect(prov.value).toBe('high');
    expect(prov.source).toBe('operator_entered'); // defaulted
    expect(prov.confidence).toBe(0.9);
    expect(prov.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('writes a first-class Profile column to the column itself, not customFields, and stamps provenance', async () => {
    const res = await call({ fields: { industry: { value: 'Fashion', confidence: 1 } } });
    expect(res.status).toBe(200);

    const data = m.update.mock.calls[0][0].data;
    expect(data.industry).toBe('Fashion'); // first-class column write
    expect(data.customFields).toEqual({}); // NOT shadowed as a custom field
    const prov = data.fieldProvenance.industry;
    expect(prov).toMatchObject({ value: 'Fashion', source: 'operator_entered', confidence: 1 });
    expect(prov.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('writes the member as a STAFF-gated audit event, no engagement for operator edits', async () => {
    await call({ fields: { city: { value: 'NYC' } } });
    expect(m.requirePermission).toHaveBeenCalled();
    const emit = m.emitEvent.mock.calls[0][0];
    expect(emit).toMatchObject({ action: 'member.fields_updated', entityType: 'member', entityId: 'M' });
    expect(emit.engagement).toBeUndefined();
  });

  it('sync-sourced writes (verified_enrichment) append an enrichment_synced engagement event', async () => {
    await call({ fields: { companyName: { value: 'Acme', source: 'verified_enrichment' } } });
    const emit = m.emitEvent.mock.calls[0][0];
    expect(emit.engagement).toMatchObject({ memberId: 'M', eventType: 'enrichment_synced' });
  });

  it('preserves existing customFields/provenance keys (additive merge)', async () => {
    m.findFirst.mockResolvedValue({
      id: 'M',
      customFields: { vibe: 'high' },
      fieldProvenance: { vibe: { value: 'high', source: 'self_reported', syncedAt: 't0' } },
      mergedIntoId: null,
    });
    await call({ fields: { dietary: { value: 'veg' } } });
    const data = m.update.mock.calls[0][0].data;
    expect(data.customFields).toEqual({ vibe: 'high', dietary: 'veg' });
    expect(data.fieldProvenance.vibe).toEqual({ value: 'high', source: 'self_reported', syncedAt: 't0' });
  });

  it('returns 403 (gate response) for a non-STAFF caller, never touching the DB', async () => {
    const forbidden = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    m.requirePermission.mockResolvedValue({ ok: false, response: forbidden });
    const res = await call({ fields: { city: { value: 'NYC' } } });
    expect(res.status).toBe(403);
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });

  it('returns 409 when editing a soft-merged duplicate (edit the canonical instead)', async () => {
    m.findFirst.mockResolvedValue({ id: 'M', customFields: null, fieldProvenance: null, mergedIntoId: 'C' });
    const res = await call({ fields: { city: { value: 'NYC' } } });
    expect(res.status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the member is not in the caller workspace', async () => {
    m.findFirst.mockResolvedValue(null);
    const res = await call({ fields: { city: { value: 'NYC' } } });
    expect(res.status).toBe(404);
  });

  it('returns 400 on an empty/invalid body, before any DB read', async () => {
    const res = await call({ fields: {} });
    expect(res.status).toBe(400);
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 on an unknown provenance source', async () => {
    const res = await call({ fields: { x: { value: 'v', source: 'guessed' } } });
    expect(res.status).toBe(400);
  });

  // ── Firewall + identity guards (Slice 2) ──────────────────────────────────
  it.each(['archetype', 'archetypeScores'])(
    'hard-rejects the reserved firewall key "%s" before any DB write',
    async (key) => {
      const res = await call({ fields: { [key]: { value: 'X' } } });
      expect(res.status).toBe(400);
      expect(m.update).not.toHaveBeenCalled();
    },
  );

  it.each(['email', 'totalEventsAttended', 'energyScore'])(
    'rejects the read-only key "%s" (identity / computed)',
    async (key) => {
      const res = await call({ fields: { [key]: { value: 'x' } } });
      expect(res.status).toBe(400);
      expect(m.update).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-text value written to a first-class column', async () => {
    const res = await call({ fields: { industry: { value: ['a', 'b'] } } });
    expect(res.status).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
  });
});
