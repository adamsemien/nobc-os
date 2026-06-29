import { db } from './db';

/**
 * Resolve the workspace for the slug-less public membership apply form.
 *
 * Prefers an explicit `APPLY_DEFAULT_WORKSPACE_ID` (the multi-tenant-safe path).
 * Falls back to the OLDEST workspace — deterministic, unlike a bare findFirst()
 * with no ordering, and identical to tenant-zero behaviour on a single-tenant
 * install. If a second workspace ever exists with no default configured, this
 * route is genuinely ambiguous: we log loudly so the tripwire fires before any
 * applicant is silently routed to whichever row Postgres happens to return.
 *
 * Extracted from app/api/apply/membership/route.ts so the account-link layer
 * resolves the apply workspace through the exact same logic.
 */
export async function resolveDefaultApplyWorkspace(): Promise<{ id: string } | null> {
  const configuredId = process.env.APPLY_DEFAULT_WORKSPACE_ID;
  if (configuredId) {
    return db.workspace.findUnique({ where: { id: configuredId }, select: { id: true } });
  }
  const workspaces = await db.workspace.findMany({
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: { id: true },
  });
  if (workspaces.length > 1) {
    console.error(
      '[apply/membership] Multiple workspaces exist but APPLY_DEFAULT_WORKSPACE_ID is unset — ' +
        'defaulting to the oldest. Set APPLY_DEFAULT_WORKSPACE_ID before onboarding a second tenant.',
    );
  }
  return workspaces[0] ?? null;
}
