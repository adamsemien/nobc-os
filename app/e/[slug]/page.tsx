import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { assemblePublicEventDTO } from '@/lib/public-event-loader';
import { getEventHeroDisplayUrl } from '@/lib/event-hero-url';
import { EventDetail } from '@/app/m/events/[slug]/_components/EventDetail';
import { PublicEventShell } from './_components/PublicEventShell';

// Base URL used to make og:image absolute. Link unfurlers (iMessage / Slack /
// Twitter) crawl this public route without a session and require an absolute
// https image URL - a relative R2 proxy path would not resolve for them.
// Mirrors the established fallback in lib/email-templates.ts (not a new guess).
const SITE_BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.thenobadcompany.com'
).replace(/\/+$/, '');

/**
 * Make a hero URL absolute for use as og:image. Legacy/demo heroes are already
 * absolute https URLs; private-R2 heroes resolve to a relative proxy path and
 * need the base prefix. Returns null when there is no usable image.
 */
function toAbsoluteImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${SITE_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Open Graph / Twitter card for the shared public event link. Runs server-side
 * per request and MUST NEVER throw — a throw here would 500 the public event
 * page. Every failure path degrades to sane site defaults instead of erroring.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: 'No Bad Company',
    description: 'An evening with No Bad Company.',
  };
  try {
    const { slug } = await params;
    // Lightweight read of just the card fields. Mirrors the published-by-slug
    // resolve in lib/public-event-loader.ts (slug + PUBLISHED, server-derived).
    const event = await db.event.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { title: true, description: true, heroImageAssetId: true },
    });
    if (!event) return fallback;

    const title = event.title?.trim() || 'No Bad Company';
    const rawDescription =
      event.description?.trim() || 'An evening with No Bad Company.';
    const description =
      rawDescription.length > 200
        ? `${rawDescription.slice(0, 197).trimEnd()}...`
        : rawDescription;
    // No-hero events fall back to the site default card instead of an
    // imageless unfurl (this openGraph object replaces the root's wholesale).
    const image =
      toAbsoluteImageUrl(getEventHeroDisplayUrl(event.heroImageAssetId)) ??
      `${SITE_BASE_URL}/og-default.png`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        siteName: 'No Bad Company',
        type: 'website',
        ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch (err) {
    // Never let a metadata failure surface as a 500 on the public page.
    console.error('[event-og-metadata] failed to build metadata', err);
    return fallback;
  }
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dto = await assemblePublicEventDTO(slug);
  if (!dto) notFound();

  // Every event — including the active one — renders the full event page. The
  // active event's two-choice fork lives in the access-card slot inside the
  // template (see TemplateSplit), not as a whole-page replacement.
  return (
    <PublicEventShell theme={dto.pageStyle.theme}>
      <EventDetail event={dto} />
    </PublicEventShell>
  );
}
