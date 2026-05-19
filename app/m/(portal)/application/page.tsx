import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';

const SECTIONS: Record<string, string> = {
  basics: 'The Basics',
  personality: 'Personality & Perspective',
  community: 'Community Fit',
  taste: 'Taste',
  rapid: 'Rapid Fire',
  about: 'Tell Us About You',
};

function formatAnswerKey(key: string): string {
  const withoutPrefix = key.includes('.') ? key.split('.').slice(1).join('.') : key;
  return withoutPrefix
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function getSection(key: string): string {
  const prefix = key.split('.')[0];
  return prefix;
}

function StatusBadge({ status }: { status: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (status) {
    case 'APPROVED':
      bg = 'var(--success-soft)';
      color = 'var(--success)';
      label = 'Approved';
      break;
    case 'PENDING':
      bg = 'var(--warning-soft)';
      color = 'var(--warning)';
      label = 'Under Review';
      break;
    case 'WAITLISTED':
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = 'Waitlisted';
      break;
    case 'REJECTED':
    case 'DECLINED':
      bg = 'var(--danger-soft)';
      color = 'var(--danger)';
      label = 'Not Approved';
      break;
    case 'HOLD':
      bg = 'var(--warning-soft)';
      color = 'var(--warning)';
      label = 'On Hold';
      break;
    default:
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = status;
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em]"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

function statusMessage(status: string): string {
  switch (status) {
    case 'PENDING':
      return "Your application is being reviewed. We'll be in touch soon.";
    case 'APPROVED':
      return "You're in. Welcome to No Bad Company.";
    case 'REJECTED':
      return "We appreciate your interest. This membership isn't the right fit at this time.";
    case 'WAITLISTED':
      return "You're on our waitlist. We'll reach out when a spot opens up.";
    case 'HOLD':
      return "Your application is on hold. Someone from our team will be in touch.";
    case 'DECLINED':
      return "We appreciate your interest. This membership isn't the right fit at this time.";
    default:
      return '';
  }
}

export default async function ApplicationPage() {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect('/apply');

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { id: true, email: true, status: true },
  });

  const application = member
    ? await db.application.findFirst({
        where: { workspaceId, email: member.email },
        orderBy: { createdAt: 'desc' },
        include: { answers: { orderBy: { createdAt: 'asc' } } },
      })
    : null;

  if (!application) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-10">
        <p className="text-sm mb-4" style={{ color: 'var(--events-fg-soft)' }}>
          No application on file.
        </p>
        <Link
          href="/apply"
          className="text-xs"
          style={{ color: 'var(--events-warm-accent)' }}
        >
          Apply now →
        </Link>
      </div>
    );
  }

  // Group answers by section prefix, filtering out photos
  const grouped: Record<string, typeof application.answers> = {};
  for (const answer of application.answers) {
    if (answer.questionKey.startsWith('photos.') || answer.questionKey === 'photos') continue;
    const section = getSection(answer.questionKey);
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(answer);
  }

  // Order sections by SECTIONS key order
  const sectionOrder = Object.keys(SECTIONS);
  const otherSections = Object.keys(grouped).filter((s) => !sectionOrder.includes(s));
  const orderedSections = [...sectionOrder.filter((s) => grouped[s]), ...otherSections];

  const msg = statusMessage(application.status);

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-10">
      {/* Status section */}
      <div>
        <h1
          className="text-2xl font-normal"
          style={{
            color: 'var(--events-fg)',
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
          }}
        >
          Application
        </h1>
        <div className="mt-3">
          <StatusBadge status={application.status} />
        </div>
        {msg && (
          <p className="text-sm leading-relaxed mt-3" style={{ color: 'var(--events-fg-soft)' }}>
            {msg}
          </p>
        )}
      </div>

      <hr className="my-8" style={{ borderColor: 'var(--events-line-soft)' }} />

      {/* Application details */}
      <div className="mb-6 space-y-3">
        <div>
          <p className="text-[0.6rem] uppercase tracking-[0.15em]" style={{ color: 'var(--events-fg-quiet)' }}>
            Name
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--events-fg-soft)' }}>
            {application.fullName}
          </p>
        </div>
        <div>
          <p className="text-[0.6rem] uppercase tracking-[0.15em]" style={{ color: 'var(--events-fg-quiet)' }}>
            Email
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--events-fg-soft)' }}>
            {application.email}
          </p>
        </div>
        {(application.city || application.neighborhood) && (
          <div>
            <p className="text-[0.6rem] uppercase tracking-[0.15em]" style={{ color: 'var(--events-fg-quiet)' }}>
              Location
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--events-fg-soft)' }}>
              {[application.neighborhood, application.city].filter(Boolean).join(', ')}
            </p>
          </div>
        )}
        {application.referredBy && (
          <div>
            <p className="text-[0.6rem] uppercase tracking-[0.15em]" style={{ color: 'var(--events-fg-quiet)' }}>
              Referred By
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--events-fg-soft)' }}>
              {application.referredBy}
            </p>
          </div>
        )}
      </div>

      {/* Answers by section */}
      {orderedSections.map((sectionKey) => {
        const sectionAnswers = grouped[sectionKey];
        if (!sectionAnswers || sectionAnswers.length === 0) return null;

        const sectionTitle = SECTIONS[sectionKey] ?? sectionKey;

        return (
          <div key={sectionKey} className="mb-8">
            <p
              className="text-[0.6rem] uppercase tracking-[0.2em] mb-4"
              style={{ color: 'var(--events-fg-quiet)' }}
            >
              {sectionTitle}
            </p>
            {sectionAnswers.map((ans) => (
              <div key={ans.id}>
                <p
                  className="text-[0.6rem] uppercase tracking-[0.15em]"
                  style={{ color: 'var(--events-fg-quiet)' }}
                >
                  {formatAnswerKey(ans.questionKey)}
                </p>
                <p
                  className="text-sm leading-relaxed mt-0.5 mb-4"
                  style={{ color: 'var(--events-fg-soft)' }}
                >
                  {ans.answer}
                </p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
