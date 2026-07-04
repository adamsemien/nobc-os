import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route coverage for the F5 member field-definition CRUD: GET (STAFF+) list, PATCH (ADMIN)
// upsert/soft-delete with reserved-key (firewall) rejection. Real schema + member-editable;
// only the DB, role gate, transaction, and audit emit are mocked.

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requirePermission: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  emitEvent: vi.fn(),
}));
// GET is requireRole(STAFF); PATCH is requirePermission('settings.edit') (Phase 1.5 RBAC).
vi.mock('@/lib/operator-role', () => ({
  requireRole: m.requireRole,
  requirePermission: m.requirePermission,
}));
vi.mock('@/lib/db', () => ({
  db: {
    fieldDefinition: { findMany: m.findMany, updateMany: m.updateMany, update: m.update, create: m.create },
    $transaction: m.transaction,
  },
}));
vi.mock('@/lib/emit-event', () => ({ emitEvent: m.emitEvent }));

import { GET, PATCH } from '@/app/api/operator/settings/member-fields/route';

const ADMIN_GATE = { ok: true, userId: 'op1', workspaceId: 'w1', role: 'ADMIN' };

function patch(body: unknown) {
  return PATCH({ json: async () => body } as never);
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requireRole.mockResolvedValue(ADMIN_GATE);
  m.requirePermission.mockResolvedValue(ADMIN_GATE);
  m.findMany.mockResolvedValue([]);
  m.updateMany.mockResolvedValue({ count: 0 });
  m.update.mockResolvedValue({});
  m.create.mockResolvedValue({});
  m.emitEvent.mockResolvedValue(undefined);
  m.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ fieldDefinition: { updateMany: m.updateMany, update: m.update, create: m.create } }),
  );
});

describe('GET /api/operator/settings/member-fields', () => {
  it('lists active member field definitions for the workspace', async () => {
    m.findMany.mockResolvedValue([
      { id: 'f1', stableKey: 'dietary', name: 'Dietary', type: 'text', options: [], sponsorVisible: false, order: 0 },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields).toHaveLength(1);
    expect(m.findMany.mock.calls[0][0]).toMatchObject({
      where: { workspaceId: 'w1', section: 'member', isActive: true },
    });
  });
});

describe('PATCH /api/operator/settings/member-fields', () => {
  it('returns the gate response for a caller without settings.edit, no DB work', async () => {
    m.requirePermission.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await patch({ fields: [{ name: 'Dietary', type: 'text' }] });
    expect(res.status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it.each(['archetype', 'Archetype'])(
    'rejects a reserved/firewall field name "%s" before any write',
    async (name) => {
      const res = await patch({ fields: [{ name, type: 'text' }] });
      expect(res.status).toBe(400);
      expect(m.transaction).not.toHaveBeenCalled();
    },
  );

  it('creates a new field with a slugified stableKey under section=member', async () => {
    const res = await patch({ fields: [{ name: 'Dietary Preference', type: 'text', sponsorVisible: false }] });
    expect(res.status).toBe(200);
    const data = m.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ workspaceId: 'w1', section: 'member', stableKey: 'dietary_preference', isActive: true });
    expect(m.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'settings.member_fields_updated' }),
    );
  });

  it('soft-deletes a removed field (isActive=false) instead of dropping its values', async () => {
    m.findMany.mockResolvedValue([{ id: 'f1', stableKey: 'old' }]);
    const res = await patch({ fields: [] });
    expect(res.status).toBe(200);
    expect(m.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ['f1'] } }, data: { isActive: false } });
  });

  it('422s on an invalid body (missing name)', async () => {
    const res = await patch({ fields: [{ type: 'text' }] });
    expect(res.status).toBe(422);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
