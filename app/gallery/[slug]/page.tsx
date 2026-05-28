/**
 * Public member-gallery page — `/gallery/[slug]`. (The "slug" is the
 * ShareLink.token; we keep the route parameter name from the original spec.)
 *
 * Server component. Always password-protected (POST /api/share/token/[token]/auth
 * sets an HttpOnly, Path-scoped, 1-hour `share_auth` cookie). Tokens whose
 * mode is SPONSOR are redirected to `/assets/[token]` so the URL prefix
 * matches the share mode.
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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Member Gallery — No Bad Company',
  robots: { index: false, follow: false },
};

interface Branding {
  companyName?: string;
  primaryColor?: string;
  logo?: string;
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: token } = await params;
  const r = await resolveShareLink(token);
  if (!r.ok) {
    if (r.reason === 'INTERNAL_ERROR') return <ShareErrorState reason="INTERNAL_ERROR" />;
    notFound();
  }
  if (r.mode !== ShareLinkMode.MEMBER_GALLERY) redirect(`/assets/${token}`);

  const branding = (r.brandingOverride as Branding | null) ?? null;
  const company = (branding?.companyName ?? r.workspaceName ?? '').trim();
  const watermarkLabel = company || 'No Bad Company';

  if (!r.authed) {
    return (
      <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
        <ShareHeader title={r.folderName} kicker="Member Gallery" branding={branding} />
        <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-20 pt-2 text-center">
          <p className="mx-auto mt-6 max-w-md text-[14px] leading-[1.8] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            A password was sent with your invitation. Enter it to view the gallery.
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
    console.error('[gallery/page] listShareAssets failed', { token, error: String(err) });
    return <ShareErrorState reason="INTERNAL_ERROR" />;
  }
  const downloadsExhausted =
    r.allowedDownloads != null && r.downloadsUsed >= r.allowedDownloads;
  void bumpShareAccess(r.id);

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      <ShareHeader title={r.folderName} kicker="Member Gallery" branding={branding} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-20 pt-8">
        {(() => {
          const bits = [
            `${assets.length} ${assets.length === 1 ? 'file' : 'files'}`,
            r.allowedDownloads != null ? `${r.downloadsUsed}/${r.allowedDownloads} downloads used` : null,
            r.expiresAt ? `Expires ${r.expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : null,
          ].filter((x): x is string => x !== null);
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
        })()}
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
