import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getMemberPortalContext } from '@/lib/auth';
import MemberPortalNav from '@/app/m/_components/MemberPortalNav';
import { MemberWorkspaceGate } from '@/app/m/events/_components/MemberWorkspaceGate';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  const ctx = await getMemberPortalContext(userId);
  if (!ctx) return <MemberWorkspaceGate />;

  return (
    <>
      <MemberPortalNav firstName={ctx.firstName ?? undefined} />
      <main className="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0 pt-0" style={{ background: 'var(--events-canvas)' }}>
        {children}
      </main>
    </>
  );
}
