import { describe, it, expect } from 'vitest';
import { OperatorRole } from '@prisma/client';
import { can, roleLabel, type PermissionAction } from '@/lib/auth/can';

// Pins the Minimal RBAC permission matrix (CRM substrate, Phase 1.5). If a cell
// drifts, a role silently gains or loses a destructive capability — so the whole
// grid is locked here. Roles: OWNER > ADMIN > STAFF > READ_ONLY ("Viewer").

const OWNER_ONLY: PermissionAction[] = [
  'member.delete',
  'settings.edit',
  'role.manage',
  'payment.refund',
];
const OWNER_ADMIN: PermissionAction[] = [
  'member.bulk',
  'contact.import',
  'contact.export',
  'blast.send',
];
const STAFF_AND_UP: PermissionAction[] = ['member.edit', 'application.decide'];

describe('can() — permission matrix', () => {
  it('OWNER can do everything', () => {
    const all: PermissionAction[] = [
      'member.view',
      ...STAFF_AND_UP,
      ...OWNER_ADMIN,
      ...OWNER_ONLY,
    ];
    for (const action of all) {
      expect(can({ role: OperatorRole.OWNER }, action), action).toBe(true);
    }
  });

  it('ADMIN: everything EXCEPT delete, settings, role management, refund', () => {
    for (const action of [...STAFF_AND_UP, ...OWNER_ADMIN, 'member.view' as const]) {
      expect(can({ role: OperatorRole.ADMIN }, action), action).toBe(true);
    }
    for (const action of OWNER_ONLY) {
      expect(can({ role: OperatorRole.ADMIN }, action), action).toBe(false);
    }
  });

  it('STAFF: view + edit records/apps; NO bulk/import/export/send/delete/settings/role/refund', () => {
    expect(can({ role: OperatorRole.STAFF }, 'member.view')).toBe(true);
    for (const action of STAFF_AND_UP) {
      expect(can({ role: OperatorRole.STAFF }, action), action).toBe(true);
    }
    for (const action of [...OWNER_ADMIN, ...OWNER_ONLY]) {
      expect(can({ role: OperatorRole.STAFF }, action), action).toBe(false);
    }
  });

  it('READ_ONLY (Viewer): view only, nothing else', () => {
    expect(can({ role: OperatorRole.READ_ONLY }, 'member.view')).toBe(true);
    for (const action of [...STAFF_AND_UP, ...OWNER_ADMIN, ...OWNER_ONLY]) {
      expect(can({ role: OperatorRole.READ_ONLY }, action), action).toBe(false);
    }
  });
});

describe('roleLabel — never expose raw enums', () => {
  it('maps READ_ONLY to "Viewer" and the rest to title case', () => {
    expect(roleLabel(OperatorRole.OWNER)).toBe('Owner');
    expect(roleLabel(OperatorRole.ADMIN)).toBe('Admin');
    expect(roleLabel(OperatorRole.STAFF)).toBe('Staff');
    expect(roleLabel(OperatorRole.READ_ONLY)).toBe('Viewer');
  });
});
