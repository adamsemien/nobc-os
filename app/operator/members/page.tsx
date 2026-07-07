import { auth } from '@clerk/nextjs/server';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff, isAdmin } from '@/lib/operator-role';
import { MembersView } from './_components/MembersView';

type MemberRow = {
  id: string;
  fullName: string;
  email: string;
  status: string;
  companyName: string | null;
  archetype: string | null;
  aiScore: number | null;
  totalEventsAttended: number;
  lastAttendedDate: string | null;
  createdAt: string;
  isVip: boolean;
  isBlocked: boolean;
};

export default async function MembersPage() {
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  // member.edit (STAFF+) gates Add Member + inline edit; member.bulk (OWNER/ADMIN,
  // i.e. isAdmin under the RBAC RANK) gates the bulk-action bar. Defense-in-depth —
  // the server routes enforce both independently.
  const [canAddMembers, canBulk] = await Promise.all([
    isStaff(userId, workspaceId),
    isAdmin(userId, workspaceId),
  ]);

  const res = await operatorServerFetch('/api/operator/members');
  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load members.
      </div>
    );
  }
  const { members, total } = (await res.json()) as { members: MemberRow[]; total: number };

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <MembersView
          canAddMembers={canAddMembers}
          canBulk={canBulk}
          total={total}
          initialMembers={members.map((m) => ({
            id: m.id,
            fullName: m.fullName,
            email: m.email,
            companyName: m.companyName,
            archetype: m.archetype,
            aiScore: m.aiScore,
            totalEventsAttended: m.totalEventsAttended,
            lastAttendedDate: m.lastAttendedDate,
            createdAt: m.createdAt,
            isVip: m.isVip,
            isBlocked: m.isBlocked,
          }))}
        />
      </div>
    </div>
  );
}
