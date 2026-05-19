import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import MemberPortalNav from '@/app/m/_components/MemberPortalNav';
import { MemberWorkspaceGate } from '@/app/m/events/_components/MemberWorkspaceGate';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return <MemberWorkspaceGate />;

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { firstName: true },
  });

  return (
    <>
      <MemberPortalNav firstName={member?.firstName ?? undefined} />
      <main className="min-h-screen pb-20 sm:pb-0 pt-0" style={{ background: 'var(--events-canvas)' }}>
        {children}
      </main>
    </>
  );
}
