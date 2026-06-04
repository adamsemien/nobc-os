import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRolePage } from '@/lib/operator-role';
import { IntelligenceTabs } from '../_components/IntelligenceTabs';
import { RecapStudio, type SponsorDTO } from './_components/RecapStudio';

export const dynamic = 'force-dynamic';

const DISPLAY = 'var(--font-display)';

function personaToStrings(raw: unknown): SponsorDTO['persona'] {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const arr = (v: unknown): string => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : '');
  return {
    archetypes: arr(p.archetypes),
    seniority: arr(p.seniority),
    industries: arr(p.industries),
    companySizes: arr(p.companySizes),
    minAttendance: typeof p.minAttendance === 'number' ? p.minAttendance : null,
  };
}

export default async function RecapStudioPage() {
  const { workspaceId } = await requireRolePage(OperatorRole.ADMIN);

  const [sponsorsRaw, events] = await Promise.all([
    db.sponsorBrandProfile.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, declaredObjectives: true, targetPersonaCriteria: true, rightsFeeCents: true },
    }),
    db.event.findMany({
      where: { workspaceId },
      orderBy: { startAt: 'desc' },
      take: 60,
      select: { id: true, title: true, startAt: true },
    }),
  ]);

  const sponsors: SponsorDTO[] = sponsorsRaw.map((s) => ({
    id: s.id,
    name: s.name,
    declaredObjectives: s.declaredObjectives ?? '',
    rightsFeeDollars: s.rightsFeeCents != null ? s.rightsFeeCents / 100 : null,
    persona: personaToStrings(s.targetPersonaCriteria),
  }));

  const eventOptions = events.map((e) => ({
    id: e.id,
    label: `${e.title} — ${e.startAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
  }));

  return (
    <div className="min-h-screen px-6 py-10 md:px-12" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <IntelligenceTabs isAdmin={true} />
      <header className="pb-8">
        <h1 className="text-5xl italic leading-[1.05] md:text-7xl" style={{ fontFamily: DISPLAY, fontWeight: 200 }}>
          Recap Studio
        </h1>
        <p className="mt-5 max-w-2xl text-[14px]" style={{ color: 'var(--text-secondary)' }}>
          Set each sponsor&rsquo;s Brief — their objectives, the audience they came for, and their rights fee —
          then generate an editorial Activation Recap for any completed event. Every number is computed from
          first-party attendance and audience data; the sponsor receives a password-protected magic link.
        </p>
      </header>
      <div className="border-t" style={{ borderColor: 'var(--border)' }} />
      <RecapStudio sponsors={sponsors} events={eventOptions} />
    </div>
  );
}
