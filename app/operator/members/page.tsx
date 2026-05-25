import { auth } from '@clerk/nextjs/server';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff } from '@/lib/operator-role';
import { MembersView } from './_components/MembersView';

type MemberRow = {
  id: string;
  fullName: string;
  email: string;
  status: string;
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
  const canAddMembers = await isStaff(userId, workspaceId);

  const res = await operatorServerFetch('/api/operator/members');
  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load members.
      </div>
    );
  }
  const { members } = (await res.json()) as { members: MemberRow[] };

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1280px]">
        <MembersView
          canAddMembers={canAddMembers}
          initialMembers={members.map((m) => ({
            id: m.id,
            fullName: m.fullName,
            email: m.email,
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
