/** Vanity member card — screenshotable.
 *  Inline-styled (no Tailwind tokens) so it renders consistently if shared. */

import { archetypeDisplayName } from '@/config/archetypes';

export function MemberCard({
  firstName,
  lastName,
  archetype,
  memberSince,
  memberNumber,
}: {
  firstName: string;
  lastName: string;
  archetype: string | null;
  memberSince: string;
  memberNumber: string;
}) {
  const since = new Date(memberSince).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg p-6 sm:p-8"
      style={{
        background:
          'linear-gradient(135deg, var(--events-card), color-mix(in srgb, var(--events-warm-accent) 8%, var(--events-card)))',
        border: '1px solid var(--events-line-soft)',
        minHeight: 200,
      }}
    >
      <div className="flex justify-between items-start">
        <div>
          <p
            className="text-[0.55rem] uppercase tracking-[0.25em]"
            style={{ color: 'var(--events-fg-quiet)' }}
          >
            No Bad Company
          </p>
          <h2
            className="mt-3 text-3xl italic"
            style={{ color: 'var(--events-fg)', fontFamily: 'var(--font-display)' }}
          >
            {firstName} {lastName}
          </h2>
          {archetype ? (
            <p
              className="mt-2 text-[0.65rem] uppercase tracking-[0.2em]"
              style={{ color: 'var(--events-warm-accent)' }}
            >
              {archetypeDisplayName(archetype)}
            </p>
          ) : null}
        </div>
        <Seal />
      </div>

      <div
        className="mt-8 flex flex-wrap items-end justify-between gap-4 pt-4"
        style={{ borderTop: '1px solid var(--events-line-soft)' }}
      >
        <div>
          <p
            className="text-[0.55rem] uppercase tracking-[0.22em]"
            style={{ color: 'var(--events-fg-quiet)' }}
          >
            Member since
          </p>
          <p className="text-sm" style={{ color: 'var(--events-fg)' }}>
            {since}
          </p>
        </div>
        <div className="text-right">
          <p
            className="text-[0.55rem] uppercase tracking-[0.22em]"
            style={{ color: 'var(--events-fg-quiet)' }}
          >
            Member no.
          </p>
          <p
            className="text-sm tabular-nums"
            style={{ color: 'var(--events-fg)', fontFamily: 'monospace' }}
          >
            {memberNumber}
          </p>
        </div>
      </div>
    </div>
  );
}

function Seal() {
  return (
    <svg
      viewBox="0 0 48 48"
      width={40}
      height={40}
      style={{ color: 'var(--events-warm-accent)' }}
      aria-hidden
    >
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1" />
      <text
        x="24"
        y="28"
        textAnchor="middle"
        fontSize="9"
        fontFamily="serif"
        fontStyle="italic"
        fill="currentColor"
      >
        NoBC
      </text>
    </svg>
  );
}
