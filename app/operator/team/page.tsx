import { clerkClient } from '@clerk/nextjs/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRolePage } from '@/lib/operator-role';
import { can } from '@/lib/auth/can';
import { PageHeader } from '../_components/PageHeader';
import { TeamManager, type TeamMemberDTO } from './_components/TeamManager';

/** clerkUserIds of this workspace's Clerk org admins. Their access floors to
 *  OWNER regardless of the WorkspaceMember row, so the Team UI must mark them
 *  "Managed in Clerk" instead of offering controls that silently no-op.
 *  Fails soft to an empty set — the server routes guard independently. */
async function clerkOrgAdminIds(workspaceId: string): Promise<Set<string>> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { clerkOrgId: true },
  });
  if (!ws?.clerkOrgId) return new Set();
  try {
    const client = await clerkClient();
    const memberships = await client.organizations.getOrganizationMembershipList({
      organizationId: ws.clerkOrgId,
      limit: 100,
    });
    return new Set(
      memberships.data
        .filter((m) => m.role === 'org:admin' || m.role === 'admin')
        .map((m) => m.publicUserData?.userId)
        .filter((id): id is string => !!id),
    );
  } catch {
    return new Set();
  }
}

// Any operator can view the team (READ_ONLY+); only OWNER gets role-management
// controls (role.manage). The server routes enforce role.manage independently —
// this flag is defense-in-depth UI gating (Minimal RBAC, Phase 1.5).
export default async function TeamPage() {
  const { role, workspaceId } = await requireRolePage(OperatorRole.READ_ONLY);

  const [members, orgAdminIds] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        clerkUserId: true,
        createdAt: true,
      },
    }),
    clerkOrgAdminIds(workspaceId),
  ]);

  const dto: TeamMemberDTO[] = members.map((m) => ({
    id: m.id,
    email: m.email,
    name: [m.firstName, m.lastName].filter(Boolean).join(' ').trim(),
    role: m.role,
    pending: !m.clerkUserId,
    createdAt: m.createdAt.toISOString(),
    managedInClerk: !!m.clerkUserId && orgAdminIds.has(m.clerkUserId),
  }));

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[900px]">
        <PageHeader
          title="Team"
          subtitle="Operators who can access this workspace."
        />
        <TeamManager members={dto} canManage={can({ role }, 'role.manage')} />
      </div>
    </div>
  );
}
