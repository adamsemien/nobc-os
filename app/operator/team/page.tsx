import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRolePage } from '@/lib/operator-role';
import { can } from '@/lib/auth/can';
import { PageHeader } from '../_components/PageHeader';
import { TeamManager, type TeamMemberDTO } from './_components/TeamManager';

// Any operator can view the team (READ_ONLY+); only OWNER gets role-management
// controls (role.manage). The server routes enforce role.manage independently —
// this flag is defense-in-depth UI gating (Minimal RBAC, Phase 1.5).
export default async function TeamPage() {
  const { role, workspaceId } = await requireRolePage(OperatorRole.READ_ONLY);

  const members = await db.workspaceMember.findMany({
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
  });

  const dto: TeamMemberDTO[] = members.map((m) => ({
    id: m.id,
    email: m.email,
    name: [m.firstName, m.lastName].filter(Boolean).join(' ').trim(),
    role: m.role,
    pending: !m.clerkUserId,
    createdAt: m.createdAt.toISOString(),
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
