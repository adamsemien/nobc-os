import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level coverage for GET /api/operator/members/[id]/record.

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  assemble: vi.fn(),
}));
vi.mock('@/lib/operator-role', () => ({
  requireRole: m.requireRole,
  // Faithful rank check (ADMIN > STAFF > READ_ONLY) so the route's psychographics gate
  // is exercised for real against the mocked gate role.
  roleAtLeast: (role: string, min: string) => {
    const order: Record<string, number> = { READ_ONLY: 0, STAFF: 1, ADMIN: 2 };
    return (order[role] ?? -1) >= (order[min] ?? Infinity);
  },
}));
vi.mock('@/lib/member-record', () => ({ assembleMemberRecord: m.assemble }));

import { GET } from '@/app/api/operator/members/[id]/record/route';

const GATE = { ok: true, userId: 'op1', workspaceId: 'w1', role: 'READ_ONLY' };

function call(id = 'M', search = '') {
  const url = `https://x/api/operator/members/${id}/record${search}`;
  const req = { nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0];
  return GET(req, { params: Promise.resolve({ id }) } as unknown as Parameters<typeof GET>[1]);
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requireRole.mockResolvedValue(GATE);
  m.assemble.mockResolvedValue({ member: { id: 'M' }, psychographics: { archetype: 'Connector' }, timeline: [] });
});

describe('GET /api/operator/members/[id]/record', () => {
  it('lets a READ_ONLY operator view the record but withholds psychographics', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.requireRole).toHaveBeenCalled();
    expect(m.assemble.mock.calls[0][0]).toMatchObject({ workspaceId: 'w1', memberId: 'M', includePsychographics: false });
  });

  it('includes psychographics for a STAFF operator', async () => {
    m.requireRole.mockResolvedValue({ ...GATE, role: 'STAFF' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.assemble.mock.calls[0][0]).toMatchObject({ includePsychographics: true });
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
