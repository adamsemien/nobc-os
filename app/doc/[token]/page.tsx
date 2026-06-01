/**
 * Public magic-link recap/brief landing — `/doc/[token]`.
 *
 * Server component. Resolves the GeneratedAsset token, renders a password gate when gated, then
 * an editorial cover (headline equivalent-media-value + objectives) with a button to download
 * the full PDF. No member PII — only the sponsor-facing payload is read.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveRecapToken } from '@/lib/intelligence/recap-resolve';
import { fmtMultiple, fmtUsdCompact } from '@/lib/intelligence/recap-format';
import { ShareHeader } from '@/app/_components/share/ShareHeader';
import { ShareFooter } from '@/app/_components/share/ShareFooter';
import { ShareErrorState } from '@/app/_components/share/ShareErrorState';
import { DocPasswordForm } from './DocPasswordForm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Activation Recap — No Bad Company',
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  met: 'Delivered',
  on_track: 'On track',
  partial: 'Partial',
  pending_module: 'Available with module',
  not_declared: 'Not a stated goal',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolveRecapToken(token);

  if (!r.ok) {
    if (r.reason === 'INTERNAL_ERROR') return <ShareErrorState reason="INTERNAL_ERROR" />;
    notFound();
  }
  if (r.expired) return <ShareErrorState reason="EXPIRED" />;

  const { recap } = r;
  const kicker = recap.kind === 'audience_intelligence_brief' ? 'Audience Intelligence Brief' : 'Activation Recap';

  if (r.passwordProtected && !r.authed) {
    return (
      <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
        <ShareHeader title={recap.event.name} kicker={kicker} />
        <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-20 pt-2 text-center">
          <p className="mx-auto mt-6 max-w-md text-[14px] leading-[1.8] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Enter the password you were sent to open {recap.sponsor.name}&rsquo;s recap.
          </p>
          <DocPasswordForm token={token} />
        </main>
        <ShareFooter companyName={recap.sponsor.name} />
      </div>
    );
  }

  const declared = recap.objectives.filter((o) => o.declared);
  const mv = recap.mediaValue;

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      <ShareHeader title={recap.event.name} kicker={kicker} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-2">
        <p className="text-center text-[12px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          {recap.sponsor.name} · {recap.event.dateLabel}
          {recap.event.venue ? ` · ${recap.event.venue}` : ''}
        </p>

        <p className="mx-auto mt-7 max-w-lg text-center text-[17px] italic leading-[1.5] text-[var(--apply-muted)] font-[family-name:var(--font-cormorant)]">
          {recap.narrative.coverStandfirst}
        </p>

        <div className="my-9 rounded-[6px] border px-7 py-7 text-center" style={{ borderColor: 'var(--apply-rule)' }}>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {recap.kind === 'audience_intelligence_brief' ? 'Projected media value · one activation' : 'Equivalent media value'}
          </div>
          <div className="mt-2 text-[clamp(2.5rem,9vw,4rem)] leading-none text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            {fmtUsdCompact(mv.headline.totalCents)}
          </div>
          {mv.valueVsFeeMultiple != null && (
            <div className="mt-3 text-[13px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              {fmtMultiple(mv.valueVsFeeMultiple)} your rights fee in equivalent media value
            </div>
          )}
        </div>

        <ul className="mx-auto max-w-lg">
          {declared.map((o) => (
            <li
              key={o.objective}
              className="flex items-start gap-3 border-t py-4 first:border-t-0"
              style={{ borderColor: 'var(--apply-rule)' }}
            >
              <span
                aria-hidden
                className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: o.status === 'met' ? 'var(--nobc-red)' : 'var(--apply-muted)' }}
              />
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-medium text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                    {o.objective}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-[1.55] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  {o.headline}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-12 text-center">
          <a
            href={`/api/doc/${encodeURIComponent(token)}/download`}
            className="inline-block rounded-[4px] bg-[var(--nobc-red)] px-7 py-3 text-[12px] font-medium uppercase tracking-[0.2em] text-[var(--nobc-on-red)] font-[family-name:var(--font-dm-sans)]"
          >
            Download the full recap
          </a>
          <p className="mt-3 text-[11px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Five pages · PDF · prepared for {recap.sponsor.name}
          </p>
        </div>
      </main>
      <ShareFooter companyName={recap.sponsor.name} />
    </div>
  );
}
