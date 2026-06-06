import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level coverage for the provenance write-path PATCH /api/operator/members/[id].
// Exercises the real handler with the real schema + applyFieldWrites; only the DB,
// the role gate, the audit emit, and module-load-only deps are mocked.

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  emitEvent: vi.fn(),
}));
vi.mock('@/lib/operator-role', () => ({ requireRole: m.requireRole }));
vi.mock('@/lib/db', () => ({ db: { member: { findFirst: m.findFirst, update: m.update } } }));
vi.mock('@/lib/emit-event', () => ({ emitEvent: m.emitEvent }));
// Imported at module load by the GET handler; unused by PATCH but must resolve.
vi.mock('@/lib/auth', () => ({ requireWorkspaceId: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));

import { PATCH } from '@/app/api/operator/members/[id]/route';

const STAFF_GATE = { ok: true, userId: 'op1', workspaceId: 'w1', role: 'STAFF' };

function call(body: unknown, id = 'M') {
  return PATCH({ json: async () => body } as any, { params: Promise.resolve({ id }) } as any);
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requireRole.mockResolvedValue(STAFF_GATE);
  m.findFirst.mockResolvedValue({ id: 'M', customFields: null, fieldProvenance: null, mergedIntoId: null });
  m.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'M', ...data }));
  m.emitEvent.mockResolvedValue(undefined);
});

describe('PATCH /api/operator/members/[id] — provenance write-path', () => {
  it('stamps fieldProvenance {value, source, confidence, syncedAt} and writes customFields', async () => {
    const res = await call({ fields: { industry: { value: 'Fashion', confidence: 0.9 } } });
    expect(res.status).toBe(200);

    const data = m.update.mock.calls[0][0].data;
    expect(data.customFields).toEqual({ industry: 'Fashion' });
    const prov = data.fieldProvenance.industry;
    expect(prov.value).toBe('Fashion');
    expect(prov.source).toBe('operator_entered'); // defaulted
    expect(prov.confidence).toBe(0.9);
    expect(prov.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('writes the member as a STAFF-gated audit event, no engagement for operator edits', async () => {
    await call({ fields: { city: { value: 'NYC' } } });
    expect(m.requireRole).toHaveBeenCalled();
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
      customFields: { city: 'NYC' },
      fieldProvenance: { city: { value: 'NYC', source: 'self_reported', syncedAt: 't0' } },
      mergedIntoId: null,
    });
    await call({ fields: { industry: { value: 'Tech' } } });
    const data = m.update.mock.calls[0][0].data;
    expect(data.customFields).toEqual({ city: 'NYC', industry: 'Tech' });
    expect(data.fieldProvenance.city).toEqual({ value: 'NYC', source: 'self_reported', syncedAt: 't0' });
  });

  it('returns 403 (gate response) for a non-STAFF caller, never touching the DB', async () => {
    const forbidden = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    m.requireRole.mockResolvedValue({ ok: false, response: forbidden });
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
});
