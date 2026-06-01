/**
 * Sponsor-facing audience metrics — computed in code, workspace-scoped, PII-safe.
 *
 * Member emails are used ONLY as internal join keys (RSVP → Application.archetype,
 * RSVP → Application.city); they are never returned. Every value returned here is a
 * count or a percentage. Any breakdown cell below MIN_CELL attendees is either flagged
 * `suppressed` or rolled into an "Other" bucket so a small cell can't be reconstructed.
 *
 * Access tier is DERIVED (there is no tier column): comp → Comp; member.status GUEST →
 * Guest; otherwise → Member ("Member Access / Guest Access / Comp Access").
 */
import { db } from '@/lib/db';
import {
  archetypeToBucket,
  INFLUENCE_TIER_META,
  INFLUENCE_TIER_ORDER,
  QUALIFIED_EXEC_TIERS,
  type InfluenceBucket,
} from './influence-tiers';
import type {
  AccessTierKey,
  AudienceMetrics,
  DistributionCell,
  InfluenceTierShare,
  TierScanStats,
} from './recap-types';

/** Suppress any sponsor-facing breakdown cell with fewer than this many attendees. */
export const MIN_CELL = 5;

export interface PersonaCriteria {
  archetypes?: string[]; // archetype names OR influence-tier names
  industries?: string[];
  seniority?: string[];
  companySizes?: string[];
  minAttendance?: number;
}

const REGISTERED_TICKET_STATUSES = new Set(['confirmed', 'held']);

type RsvpRow = {
  isComp: boolean;
  checkedIn: boolean;
  ticketStatus: string;
  guestEmail: string | null;
  member: {
    status: string;
    email: string;
    industry: string | null;
    seniority: string | null;
    jobFunction: string | null;
    companySize: string | null;
  } | null;
};

function accessTier(r: { isComp: boolean; member: { status: string } | null }): AccessTierKey {
  if (r.isComp) return 'Comp';
  if (r.member?.status === 'GUEST') return 'Guest';
  return 'Member';
}

function joinEmail(r: RsvpRow): string {
  return (r.member?.email ?? r.guestEmail ?? '').toLowerCase().trim();
}

/** Roll a label→count map into suppressed distribution cells (sub-threshold merged into "Other"). */
function toDistribution(counts: Map<string, number>, total: number): DistributionCell[] {
  const cells: DistributionCell[] = [];
  let suppressed = 0;
  for (const [label, count] of counts) {
    if (count < MIN_CELL) {
      suppressed += count;
      continue;
    }
    cells.push({ label, count, pct: total ? count / total : 0, suppressed: false });
  }
  cells.sort((a, b) => b.count - a.count);
  if (suppressed > 0) {
    cells.push({ label: 'Other', count: suppressed, pct: total ? suppressed / total : 0, suppressed: true });
  }
  return cells;
}

function personaMatches(
  p: PersonaCriteria,
  a: { archetype: string | null; industry: string | null; seniority: string | null; companySize: string | null },
): boolean {
  const inList = (val: string | null, list?: string[]): boolean =>
    !list || list.length === 0 || (val != null && list.some((x) => x.toLowerCase() === val.toLowerCase()));

  const archetypeOk = ((): boolean => {
    const list = p.archetypes;
    if (!list || list.length === 0) return true;
    if (!a.archetype) return false;
    const tier = archetypeToBucket(a.archetype);
    return list.some(
      (x) => x.toLowerCase() === a.archetype!.toLowerCase() || x.toLowerCase() === tier.toLowerCase(),
    );
  })();

  return (
    archetypeOk &&
    inList(a.industry, p.industries) &&
    inList(a.seniority, p.seniority) &&
    inList(a.companySize, p.companySizes)
  );
}

export async function computeAudienceMetrics(args: {
  workspaceId: string;
  eventId: string;
  persona?: PersonaCriteria | null;
}): Promise<AudienceMetrics> {
  const { workspaceId, eventId, persona } = args;

  const rsvps = (await db.rSVP.findMany({
    where: { workspaceId, eventId },
    select: {
      isComp: true,
      checkedIn: true,
      ticketStatus: true,
      guestEmail: true,
      member: {
        select: {
          status: true,
          email: true,
          industry: true,
          seniority: true,
          jobFunction: true,
          companySize: true,
        },
      },
    },
  })) as RsvpRow[];

  // archetype + city live on Application (not Member) — join by email, internal-only.
  const emails = Array.from(new Set(rsvps.map(joinEmail).filter(Boolean)));
  const apps = emails.length
    ? await db.application.findMany({
        where: { workspaceId, email: { in: emails } },
        select: { email: true, archetype: true, city: true },
      })
    : [];
  const archetypeByEmail = new Map<string, string | null>();
  const cityByEmail = new Map<string, string>();
  for (const a of apps) {
    const key = a.email.toLowerCase().trim();
    archetypeByEmail.set(key, a.archetype);
    if (a.city && a.city.trim()) cityByEmail.set(key, a.city.trim());
  }

  const tierAgg: Record<AccessTierKey, { registered: number; attended: number }> = {
    Member: { registered: 0, attended: 0 },
    Guest: { registered: 0, attended: 0 },
    Comp: { registered: 0, attended: 0 },
  };
  let registered = 0;
  let attended = 0;

  const influenceCounts = new Map<InfluenceBucket, number>();
  const seniorityCounts = new Map<string, number>();
  const industryCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  let qualifiedExec = 0;
  let unsegmented = 0;
  let personaMatched = 0;

  for (const r of rsvps) {
    const tier = accessTier(r);
    if (REGISTERED_TICKET_STATUSES.has(r.ticketStatus)) {
      tierAgg[tier].registered++;
      registered++;
    }
    if (!r.checkedIn) continue;

    tierAgg[tier].attended++;
    attended++;

    const email = joinEmail(r);
    const archetype = email ? archetypeByEmail.get(email) ?? null : null;
    const bucket = archetypeToBucket(archetype);
    influenceCounts.set(bucket, (influenceCounts.get(bucket) ?? 0) + 1);
    if (bucket === 'Unsegmented') unsegmented++;
    if (bucket !== 'Unsegmented' && QUALIFIED_EXEC_TIERS.includes(bucket)) qualifiedExec++;

    if (r.member?.seniority) seniorityCounts.set(r.member.seniority, (seniorityCounts.get(r.member.seniority) ?? 0) + 1);
    if (r.member?.industry) industryCounts.set(r.member.industry, (industryCounts.get(r.member.industry) ?? 0) + 1);
    const city = email ? cityByEmail.get(email) : undefined;
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);

    if (persona && personaMatches(persona, {
      archetype,
      industry: r.member?.industry ?? null,
      seniority: r.member?.seniority ?? null,
      companySize: r.member?.companySize ?? null,
    })) {
      personaMatched++;
    }
  }

  const scanByTier: TierScanStats[] = (['Member', 'Guest', 'Comp'] as AccessTierKey[]).map((t) => {
    const a = tierAgg[t];
    return {
      tier: t,
      registered: a.registered,
      attended: a.attended,
      scanRate: a.registered ? a.attended / a.registered : 0,
      suppressed: a.attended < MIN_CELL,
    };
  });

  const buckets: InfluenceBucket[] = [...INFLUENCE_TIER_ORDER, 'Unsegmented'];
  const influenceDistribution: InfluenceTierShare[] = buckets
    .map((tier): InfluenceTierShare => {
      const count = influenceCounts.get(tier) ?? 0;
      return { tier, count, pct: attended ? count / attended : 0, suppressed: count > 0 && count < MIN_CELL };
    })
    .filter((s) => s.count > 0);

  let weightSum = 0;
  for (const [bucket, count] of influenceCounts) {
    weightSum += (INFLUENCE_TIER_META[bucket]?.weight ?? INFLUENCE_TIER_META.Unsegmented.weight) * count;
  }
  const aggregateInfluenceScore = attended ? Math.round(weightSum / attended) : 0;

  return {
    registered,
    attended,
    overallScanRate: registered ? attended / registered : 0,
    scanByTier,
    influenceDistribution,
    aggregateInfluenceScore,
    qualifiedExecMix: attended ? qualifiedExec / attended : 0,
    personaMatchPct: persona ? (attended ? personaMatched / attended : 0) : null,
    personaMatchSuppressed: persona ? attended < MIN_CELL : false,
    geoSpread: toDistribution(cityCounts, attended),
    senioritySpread: toDistribution(seniorityCounts, attended),
    industrySpread: toDistribution(industryCounts, attended),
    unsegmentedPct: attended ? unsegmented / attended : 0,
  };
}
