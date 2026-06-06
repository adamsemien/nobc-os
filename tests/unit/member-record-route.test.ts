import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level coverage for GET /api/operator/members/[id]/record.

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  assemble: vi.fn(),
}));
vi.mock('@/lib/operator-role', () => ({ requireRole: m.requireRole }));
vi.mock('@/lib/member-record', () => ({ assembleMemberRecord: m.assemble }));

import { GET } from '@/app/api/operator/members/[id]/record/route';

const GATE = { ok: true, userId: 'op1', workspaceId: 'w1', role: 'READ_ONLY' };

function call(id = 'M', search = '') {
  const url = `https://x/api/operator/members/${id}/record${search}`;
  const req = { nextUrl: new URL(url) } as any;
  return GET(req, { params: Promise.resolve({ id }) } as any);
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requireRole.mockResolvedValue(GATE);
  m.assemble.mockResolvedValue({ member: { id: 'M' }, psychographics: { archetype: 'Connector' }, timeline: [] });
});

describe('GET /api/operator/members/[id]/record', () => {
  it('requires an operator role and requests psychographics for the operator path', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.requireRole).toHaveBeenCalled();
    expect(m.assemble.mock.calls[0][0]).toMatchObject({ workspaceId: 'w1', memberId: 'M', includePsychographics: true });
  });

  it('returns the gate response for a non-operator (no DB work)', async () => {
    m.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await call();
    expect(res.status).toBe(403);
    expect(m.assemble).not.toHaveBeenCalled();
  });

  it('404s when the record is not found', async () => {
    m.assemble.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
  });

  it('passes a valid ?limit through to the assembler', async () => {
    await call('M', '?limit=10');
    expect(m.assemble.mock.calls[0][0]).toMatchObject({ timelineLimit: 10 });
  });

  it('400s on an out-of-range ?limit, before any DB work', async () => {
    const res = await call('M', '?limit=9999');
    expect(res.status).toBe(400);
    expect(m.assemble).not.toHaveBeenCalled();
  });
});
