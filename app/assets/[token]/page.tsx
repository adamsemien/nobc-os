/**
 * Public sponsor delivery page — `/assets/[token]`.
 *
 * Server component. Resolves the ShareLink token, renders the editorial
 * gallery (download buttons go through `/api/share/token/[token]/download/...`
 * which logs + enforces `allowedDownloads`). Password-protected sponsor shares
 * render the password gate first. Member-gallery tokens are redirected to
 * `/gallery/[slug]` so the URL prefix is always correct for the mode.
 */
import { Fragment } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ShareLinkMode } from '@prisma/client';
import { resolveShareLink, bumpShareAccess } from '@/lib/share/resolve';
import { listShareAssets, type SharedAsset } from '@/lib/share/assets';
import { ShareHeader } from '@/app/_components/share/ShareHeader';
import { ShareGallery } from '@/app/_components/share/ShareGallery';
import { ShareErrorState } from '@/app/_components/share/ShareErrorState';
import { SharePasswordForm } from '@/app/_components/share/SharePasswordForm';
import { ShareFooter } from '@/app/_components/share/ShareFooter';

export const dynamic = 'force-dynamic'; // cookies + per-request signed URLs
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Sponsor Delivery — No Bad Company',
  robots: { index: false, follow: false },
};

interface Branding {
  companyName?: string;
  primaryColor?: string;
  logo?: string;
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolveShareLink(token);
  if (!r.ok) {
    if (r.reason === 'INTERNAL_ERROR') return <ShareErrorState reason="INTERNAL_ERROR" />;
    notFound();
  }
  if (r.mode !== ShareLinkMode.SPONSOR) redirect(`/gallery/${token}`);

  const branding = (r.brandingOverride as Branding | null) ?? null;
  const company = (branding?.companyName ?? r.workspaceName ?? '').trim();
  const watermarkLabel = company || 'No Bad Company';

  if (r.passwordProtected && !r.authed) {
    return (
      <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
        <ShareHeader title={r.folderName} kicker="Sponsor Delivery" branding={branding} />
        <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-20 pt-2 text-center">
          <p className="mx-auto mt-6 max-w-md text-[14px] leading-[1.8] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Enter the password you were sent to view this delivery.
          </p>
          <SharePasswordForm token={token} />
        </main>
        <ShareFooter companyName={branding?.companyName} />
      </div>
    );
  }

  let assets: SharedAsset[];
  try {
    assets = await listShareAssets(r.workspaceId, r.folderId);
  } catch (err) {
    console.error('[assets/page] listShareAssets failed', { token, error: String(err) });
    return <ShareErrorState reason="INTERNAL_ERROR" />;
  }
  const downloadsExhausted =
    r.allowedDownloads != null && r.downloadsUsed >= r.allowedDownloads;
  void bumpShareAccess(r.id);

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      <ShareHeader title={r.folderName} kicker="Sponsor Delivery" branding={branding} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-20 pt-8">
        <ShareMetaLine
          assetCount={assets.length}
          allowedDownloads={r.allowedDownloads}
          downloadsUsed={r.downloadsUsed}
          expiresAt={r.expiresAt}
        />
        <div className="my-8 h-px w-full bg-[var(--apply-rule)]" aria-hidden />
        <ShareGallery
          token={token}
          assets={assets}
          watermark={r.watermark}
          watermarkLabel={watermarkLabel}
          downloadsExhausted={downloadsExhausted}
        />
      </main>
      <ShareFooter companyName={branding?.companyName} />
    </div>
  );
}

function ShareMetaLine({
  assetCount,
  allowedDownloads,
  downloadsUsed,
  expiresAt,
}: {
  assetCount: number;
  allowedDownloads: number | null;
  downloadsUsed: number;
  expiresAt: Date | null;
}) {
  const bits: string[] = [`${assetCount} ${assetCount === 1 ? 'file' : 'files'}`];
  if (allowedDownloads != null) {
    bits.push(`${downloadsUsed}/${allowedDownloads} downloads used`);
  }
  if (expiresAt) {
    bits.push(`Expires ${formatExpiry(expiresAt)}`);
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
      {bits.map((bit, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden>·</span>}
          <span>{bit}</span>
        </Fragment>
      ))}
    </div>
  );
}

function formatExpiry(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
