import Link from 'next/link';
import { OperatorRole } from '@prisma/client';
import { requireRolePage, roleAtLeast } from '@/lib/operator-role';
import { assembleMemberRecord } from '@/lib/member-record';
import { db } from '@/lib/db';
import { PageHeader } from '../../_components/PageHeader';
import { Avatar } from '../../_components/Avatar';
import { ScoreBadge } from '../../_components/ScoreBadge';
import { CommentThread } from '@/components/comments/CommentThread';
import { MemberRecordHeader } from '../_components/MemberRecordHeader';
import { MemberTimeline } from '../_components/MemberTimeline';
import { MemberEditablePanels } from '../_components/MemberEditablePanels';
import { SphereOfInfluence } from '../_components/SphereOfInfluence';
import {
  ConsentPanel,
  type ConsentSubscription,
  type ConsentSuppression,
} from '../_components/ConsentPanel';
import { channelIdentifier } from '@/lib/comms/can-send';

// PR3 Slice 1+2 — record read experience (F1 identity/status, F2 timeline, F3 provenance) +
// inline edit (F4) / custom fields (F5). Server shell: role-gates the page, assembles the
// record directly (no self-HTTP), and hands the client islands their initialData. Edit
// affordances are STAFF+ and disabled on a merged record. Psychographics is NOT rendered here.

const REC_LABEL: Record<string, string> = {
  strong_yes: 'Strong yes',
  yes: 'Yes',
  unclear: 'Unclear',
  no: 'No',
  strong_no: 'Strong no',
};

export default async function MemberRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { workspaceId, role } = await requireRolePage(OperatorRole.READ_ONLY);

  const record = await assembleMemberRecord({
    workspaceId,
    memberId: id,
    includePsychographics: roleAtLeast(role, OperatorRole.STAFF),
  });

  if (!record) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Member not found.{' '}
        <Link href="/operator/members" className="text-primary underline">
          Back
        </Link>
      </div>
    );
  }

  const m = record.member;
  const fullName = `${m.firstName} ${m.lastName}`.trim() || m.email;
  // F4 edit affordances: STAFF+ and never on a merged record (PATCH returns 409 for merged).
  const canEdit = roleAtLeast(role, OperatorRole.STAFF) && !m.mergedIntoId;

  // Consent floor (Phase 1) — read-only per-channel consent for the Consent panel.
  const consent = await loadConsent(workspaceId, id, { email: m.email, phone: m.phone });

  // Identity descriptor — who this person is at a glance ("Founder at Stripe · Fintech"),
  // built from the firmographic dimensions already on the record. Degrades to whatever is set.
  const fg = record.dimensions.firmographic;
  const roleLine = [fg.jobFunction, fg.companyName].filter(Boolean).join(' at ');
  const descriptor = [roleLine || null, fg.industry].filter(Boolean).join(' · ');

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <PageHeader
        crumbs={[{ href: '/operator/members', label: 'Members' }, { label: fullName }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={fullName} email={m.email} size={44} />
            <span>{fullName}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-col gap-0.5">
            {descriptor ? (
              <span className="text-sm text-text-secondary">{descriptor}</span>
            ) : null}
            <span className="flex flex-wrap items-center gap-2 text-text-muted">
              <a href={`mailto:${m.email}`} className="underline-offset-2 hover:underline">
                {m.email}
              </a>
              {m.phone ? <span>· {m.phone}</span> : null}
            </span>
          </span>
        }
      />

      <MemberRecordHeader record={record} />

      <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="lg:flex lg:flex-col">
          <div className="rounded-lg border border-border bg-card p-5 lg:flex lg:flex-1 lg:flex-col">
            <CardLabel>Activity</CardLabel>
            <MemberTimeline memberId={id} initialData={record} />
          </div>
        </section>

        <aside className="space-y-5">
          {/* Running read (Capture) — the operator's own notes, surfaced first so the
              record opens on what the team knows, not buried below the panels. */}
          <Card>
            <CommentThread entityType="member" entityId={m.id} flush />
          </Card>

          {record.intelligence ? (
            <Card>
              <CardLabel>Assessment</CardLabel>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <ScoreBadge value={record.intelligence.aiScore} size="lg" />
                {record.intelligence.aiRecommendation ? (
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                    {REC_LABEL[record.intelligence.aiRecommendation] ?? record.intelligence.aiRecommendation}
                  </span>
                ) : null}
              </div>
              {record.intelligence.aiReasoning ? (
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  {record.intelligence.aiReasoning}
                </p>
              ) : null}
            </Card>
          ) : null}

          <MemberEditablePanels id={id} initialData={record} canEdit={canEdit} />

          {/* Consent floor (CRM substrate, Phase 1) — read-only per-channel consent. */}
          <Card>
            <ConsentPanel
              subscriptions={consent.subscriptions}
              suppressions={consent.suppressions}
            />
          </Card>

          {/* Influence Model — Layer 1 referral spine: who referred this person, and who
              they referred. Operator-curation knowledge, never sponsor-facing. */}
          <Card>
            <SphereOfInfluence memberId={m.id} canEdit={canEdit} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** Load per-channel consent for the read-only Consent panel. The consent tables may
 *  predate their migration (additive law: schema ships before Adam runs the SQL) —
 *  on any read error we return an honest empty panel rather than 500 the record. */
async function loadConsent(
  workspaceId: string,
  memberId: string,
  identity: { email?: string | null; phone?: string | null },
): Promise<{ subscriptions: ConsentSubscription[]; suppressions: ConsentSuppression[] }> {
  try {
    // Suppression is looked up by normalized identifier (email/phone), the same
    // way canSend and the lifecycle gate actually decide blocking — NOT by the
    // memberId FK, which a suppression row may not carry (a carrier STOP or a
    // bounce recorded before any Member link existed). Keeps this panel's
    // verdict identical to the Person panel and to the send path.
    const emailIdentifier = channelIdentifier(identity, 'EMAIL');
    const smsIdentifier = channelIdentifier(identity, 'SMS');
    const [subscriptions, suppressions] = await Promise.all([
      db.channelSubscription.findMany({
        where: { workspaceId, memberId },
        select: {
          channel: true,
          status: true,
          consentBasis: true,
          consentSource: true,
          consentAt: true,
        },
        orderBy: { channel: 'asc' },
      }),
      emailIdentifier || smsIdentifier
        ? db.suppressionEntry.findMany({
            where: {
              workspaceId,
              OR: [
                ...(emailIdentifier ? [{ channel: 'EMAIL' as const, identifier: emailIdentifier }] : []),
                ...(smsIdentifier ? [{ channel: 'SMS' as const, identifier: smsIdentifier }] : []),
              ],
            },
            select: { channel: true, identifier: true, reason: true },
          })
        : Promise.resolve([]),
    ]);
    return { subscriptions, suppressions };
  } catch (err) {
    console.error('[member-record] consent read failed (table may predate migration):', err);
    return { subscriptions: [], suppressions: [] };
  }
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-5">{children}</div>;
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
      {children}
    </div>
  );
}
