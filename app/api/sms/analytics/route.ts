import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// House Phone analytics — one payload powering the Intelligence "House Phone"
// tab. Workspace membership is the boundary (matches the inbox feed; no role
// gate, per the House Phone spec). All message queries are scoped to the
// workspace through the conversation relation.

/** Last 10 digits — tolerates "+1 (512) 555-0100" vs "5125550100" mismatches. */
function normPhone(p: string | null | undefined): string {
  const digits = (p ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // back to Sunday
  const start14 = new Date(now);
  start14.setHours(0, 0, 0, 0);
  start14.setDate(start14.getDate() - 13); // 14-day window incl. today

  const inboundWhere = { direction: 'INBOUND' as const, conversation: { workspaceId } };

  const [
    totalConversations,
    inboundDates,
    categoryGroups,
    topMessageGroups,
    conversations,
    members,
    totalOutbound,
    aiOutbound,
    totalMessages,
    conversationsNoReply,
  ] = await Promise.all([
    db.smsConversation.count({ where: { workspaceId } }),
    // All inbound timestamps — drives by-day, peak-hour, this-month, this-week.
    db.smsMessage.findMany({ where: inboundWhere, select: { createdAt: true } }),
    db.smsMessage.groupBy({ by: ['category'], where: inboundWhere, _count: { _all: true } }),
    db.smsMessage.groupBy({
      by: ['body'],
      where: inboundWhere,
      _count: { body: true },
      orderBy: { _count: { body: 'desc' } },
      take: 5,
    }),
    db.smsConversation.findMany({
      where: { workspaceId },
      select: { phone: true, name: true, createdAt: true },
    }),
    db.member.findMany({
      where: { workspaceId, phone: { not: null } },
      select: { phone: true, status: true },
    }),
    db.smsMessage.count({ where: { direction: 'OUTBOUND', conversation: { workspaceId } } }),
    db.smsMessage.count({
      where: { direction: 'OUTBOUND', aiGenerated: true, conversation: { workspaceId } },
    }),
    db.smsMessage.count({ where: { conversation: { workspaceId } } }),
    db.smsConversation.count({
      where: {
        workspaceId,
        messages: { some: { direction: 'INBOUND' }, none: { direction: 'OUTBOUND' } },
      },
    }),
  ]);

  // ---- VOLUME ----
  let textsThisMonth = 0;
  let textsThisWeek = 0;
  const dayBuckets = new Map<string, number>(); // yyyy-mm-dd -> count
  const hourCounts = new Array<number>(24).fill(0);
  for (const { createdAt } of inboundDates) {
    if (createdAt >= startOfMonth) textsThisMonth++;
    if (createdAt >= startOfWeek) textsThisWeek++;
    hourCounts[createdAt.getHours()]++;
    if (createdAt >= start14) {
      const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}`;
      dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
    }
  }
  const byDay: { label: string; value: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    byDay.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: dayBuckets.get(key) ?? 0 });
  }
  const peakHours = hourCounts.map((count, hour) => ({ hour, count }));

  // ---- TOPICS ----
  let uncategorizedRemaining = 0;
  const categories: { label: string; value: number }[] = [];
  for (const g of categoryGroups) {
    if (g.category === null) uncategorizedRemaining = g._count._all;
    else categories.push({ label: g.category, value: g._count._all });
  }
  categories.sort((a, b) => b.value - a.value);
  const topMessages = topMessageGroups.map((g) => ({ body: g.body, count: g._count.body }));

  // ---- CONTACT INSIGHTS ----
  const memberByPhone = new Map<string, string>();
  for (const m of members) {
    const key = normPhone(m.phone);
    if (!key) continue;
    // Prefer a non-GUEST status if the same number maps to multiple records.
    const existing = memberByPhone.get(key);
    if (!existing || (existing === 'GUEST' && m.status !== 'GUEST')) {
      memberByPhone.set(key, m.status);
    }
  }
  let memberCount = 0;
  let guestCount = 0;
  let unknownCount = 0;
  let named = 0;
  let newThisMonth = 0;
  for (const c of conversations) {
    const status = memberByPhone.get(normPhone(c.phone));
    if (!status) unknownCount++;
    else if (status === 'GUEST') guestCount++;
    else memberCount++;
    if (c.name && c.name.trim()) named++;
    if (c.createdAt >= startOfMonth) newThisMonth++;
  }
  const uniquePhones = conversations.length; // [workspaceId, phone] is unique

  // ---- RESPONSE STATS ----
  const avgMessagesPerConversation =
    totalConversations > 0
      ? Math.round((totalMessages / totalConversations) * 10) / 10
      : 0;

  return NextResponse.json({
    volume: {
      totalConversations,
      textsThisMonth,
      textsThisWeek,
      byDay,
      peakHours,
    },
    topics: {
      categories,
      uncategorizedRemaining,
      topMessages,
    },
    contacts: {
      uniquePhones,
      known: memberCount + guestCount,
      unknown: unknownCount,
      breakdown: [
        { label: 'Member', value: memberCount },
        { label: 'Guest', value: guestCount },
        { label: 'Unknown', value: unknownCount },
      ],
      nameCaptureRate: pct(named, uniquePhones),
      newThisMonth,
    },
    response: {
      aiAutoReplyRate: pct(aiOutbound, totalOutbound),
      totalOutbound,
      avgMessagesPerConversation,
      conversationsNoReply,
    },
  });
}
