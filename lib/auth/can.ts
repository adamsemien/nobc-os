/** Minimal RBAC — the permission floor every destructive operator action is
 *  checked against (CRM substrate, Phase 1.5).
 *
 *  `can()` is the ONE canonical permission check. The matrix below is a typed
 *  constant (role x action), NOT a DB table — that is the "Minimal" in Minimal
 *  RBAC. `can()` is the single choke point, so a later swap to DB-backed,
 *  per-workspace configurable permissions is transparent to call sites: they keep
 *  calling `can()` / `requirePermission()` and only this module changes.
 *
 *  Pure + dependency-light (only the Prisma enum) so it is safe to import from
 *  client components for UI hide/disable. The SERVER gate is `requirePermission()`
 *  in lib/operator-role.ts — UI gating is defense-in-depth only.
 *
 *  Roles (hierarchy OWNER > ADMIN > STAFF > READ_ONLY):
 *    OWNER  full — incl. member delete, workspace settings/billing, role management
 *    ADMIN  everything except delete, settings, role management
 *    STAFF  view + edit records/notes/tags; no bulk/import/export/send/delete
 *    READ_ONLY  read-only (displayed "Viewer")
 */
import { OperatorRole } from '@prisma/client';

export type PermissionAction =
  | 'member.view'
  | 'member.edit'
  | 'application.decide'
  | 'member.bulk'
  | 'contact.import'
  | 'contact.export'
  | 'blast.send'
  | 'member.delete'
  | 'settings.edit'
  | 'role.manage'
  | 'payment.refund';

export type Actor = { role: OperatorRole };

const O = OperatorRole;

/**
 * The permission matrix: which roles may perform each action. Listed explicitly
 * per action (not derived from a rank) so the constant is self-documenting and a
 * future DB-backed permission store reads the same shape.
 */
const MATRIX: Record<PermissionAction, readonly OperatorRole[]> = {
  'member.view': [O.OWNER, O.ADMIN, O.STAFF, O.READ_ONLY],
  'member.edit': [O.OWNER, O.ADMIN, O.STAFF],
  'application.decide': [O.OWNER, O.ADMIN, O.STAFF],
  'member.bulk': [O.OWNER, O.ADMIN],
  'contact.import': [O.OWNER, O.ADMIN],
  'contact.export': [O.OWNER, O.ADMIN],
  'blast.send': [O.OWNER, O.ADMIN],
  'member.delete': [O.OWNER],
  'settings.edit': [O.OWNER],
  'role.manage': [O.OWNER],
  'payment.refund': [O.OWNER],
};

/**
 * THE canonical permission decision. `resource` is accepted for call-site
 * stability and the future resource-scoped/DB-backed swap; Minimal RBAC ignores
 * it (permissions are role-level today).
 */
export function can(actor: Actor, action: PermissionAction, resource?: unknown): boolean {
  // `resource` is reserved for the future resource-scoped / DB-backed permission
  // swap; Minimal RBAC decides on role alone.
  void resource;
  return MATRIX[action].includes(actor.role);
}

/** Display labels — never expose the raw enum in UI. READ_ONLY reads as "Viewer". */
export const ROLE_LABEL: Record<OperatorRole, string> = {
  [O.OWNER]: 'Owner',
  [O.ADMIN]: 'Admin',
  [O.STAFF]: 'Staff',
  [O.READ_ONLY]: 'Viewer',
};

export function roleLabel(role: OperatorRole): string {
  return ROLE_LABEL[role] ?? 'Viewer';
}

/** The roles an operator can be assigned, most-privileged first (for the Team UI). */
export const ASSIGNABLE_ROLES: readonly OperatorRole[] = [
  O.OWNER,
  O.ADMIN,
  O.STAFF,
  O.READ_ONLY,
];
