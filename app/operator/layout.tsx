import { auth } from '@clerk/nextjs/server';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { OperatorNav } from './operator-nav';
import { AgentPanel } from './_components/AgentPanel';
import { ObsidianIdleEgg } from './_components/ObsidianIdleEgg';
import { AimEasterEgg } from './_components/AimEasterEgg';
import { MyspaceEasterEgg } from './_components/MyspaceEasterEgg';
import { CommandPaletteProvider } from '@/components/command-palette/CommandPaletteProvider';
import { CommandKPill } from '@/components/command-palette/CommandKPill';
import { CountsProvider } from '@/components/counts/CountsProvider';
import { DevToolbar } from './_components/DevToolbar';
import { HelpPanel } from './_components/HelpPanel';
import { OnboardingTour } from './_components/OnboardingTour';
import { OperatorTopBar } from './_components/OperatorTopBar';

export default async function OperatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();
  const workspaceId = (await getMemberWorkspaceId(userId)) ?? '';

  // Events feed the Cmd+K palette — workspace-scoped, soonest first.
  // Member count feeds the onboarding-tour empty-state check.
  const [eventsRaw, pendingApplicationCount, memberCount] = await Promise.all([
    workspaceId
      ? db.event.findMany({
          where: { workspaceId },
          select: { id: true, title: true, startAt: true, status: true },
          orderBy: { startAt: 'asc' },
        })
      : Promise.resolve([]),
    workspaceId
      ? db.application.count({ where: { workspaceId, status: 'PENDING' } })
      : Promise.resolve(0),
    workspaceId
      ? db.member.count({ where: { workspaceId, status: 'APPROVED' } })
      : Promise.resolve(0),
  ]);
  const events = eventsRaw.map((e) => ({
    id: e.id,
    title: e.title,
    startAt: e.startAt.toISOString(),
    status: e.status,
  }));

  return (
    <CommandPaletteProvider workspaceId={workspaceId} events={events}>
      <CountsProvider>
      <div
        className="operator-scope flex min-h-screen"
        style={{ background: 'var(--page-bg)' }}
      >
        <OperatorNav pendingApplicationCount={pendingApplicationCount} />
        <main className="flex min-h-screen min-w-0 flex-1 flex-col">{children}</main>
        {/* Cmd+K is owned by CommandPaletteProvider — AgentPanel binds Cmd+Shift+Option+A. */}
        <AgentPanel />
        <ObsidianIdleEgg />
        <AimEasterEgg />
        <MyspaceEasterEgg />
        <CommandKPill />
        <OperatorTopBar />
        <HelpPanel />
        <OnboardingTour hasEvents={eventsRaw.length > 0} hasMembers={memberCount > 0} />
        <DevToolbar workspaceId={workspaceId} />
      </div>
      </CountsProvider>
    </CommandPaletteProvider>
  );
}
