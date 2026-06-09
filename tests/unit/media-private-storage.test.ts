import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  applicationPhotoKey,
  isWorkspacePhotoKey,
  portraitSrc,
} from '@/lib/apply-photo';
import { getEventHeroDisplayUrl } from '@/lib/event-hero-url';
import { GET as eventHeroGet } from '@/app/api/media/event-hero/route';

// Private-storage migration (overnight infra audit, CRITICAL #1 + WARNING #9).
// Membership PII and event hero images now share the private R2 bucket. The
// cross-namespace guards below are what keep the public, unauthenticated
// event-hero proxy from ever serving an applications/* (PII) or dam/* object.

describe('application portrait references', () => {
  it('passes full URLs through (legacy/demo) and proxies R2 keys', () => {
    expect(portraitSrc('https://picsum.photos/seed/x/600/750')).toBe(
      'https://picsum.photos/seed/x/600/750',
    );
    expect(portraitSrc('applications/ws_1/abc.jpg')).toBe(
      '/api/media/application-photo?key=applications%2Fws_1%2Fabc.jpg',
    );
  });

  it('scopes photo keys to the owning workspace (IDOR guard)', () => {
    expect(isWorkspacePhotoKey('applications/ws_1/abc.jpg', 'ws_1')).toBe(true);
    expect(isWorkspacePhotoKey('applications/ws_2/abc.jpg', 'ws_1')).toBe(false); // other tenant
    expect(isWorkspacePhotoKey('applications/ws_1/../ws_2/x.jpg', 'ws_1')).toBe(false); // traversal
    expect(isWorkspacePhotoKey('dam/ws_1/x.jpg', 'ws_1')).toBe(false); // wrong namespace
    expect(isWorkspacePhotoKey('event-hero/ws_1/x.jpg', 'ws_1')).toBe(false);
  });

  it('mints workspace-scoped keys under the applications/ prefix', () => {
    const key = applicationPhotoKey('ws_1', 'jpg');
    expect(key.startsWith('applications/ws_1/')).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);
  });
});

describe('event hero display URL', () => {
  it('passes full URLs through and proxies R2 keys', () => {
    expect(getEventHeroDisplayUrl('https://x.blob.vercel-storage.com/y.jpg')).toBe(
      'https://x.blob.vercel-storage.com/y.jpg',
    );
    expect(getEventHeroDisplayUrl('event-hero/ws_1/abc.jpg')).toBe(
      '/api/media/event-hero?key=event-hero%2Fws_1%2Fabc.jpg',
    );
    expect(getEventHeroDisplayUrl('')).toBeNull();
    expect(getEventHeroDisplayUrl(null)).toBeNull();
  });
});

describe('event-hero proxy refuses non-hero keys (WARNING #9)', () => {
  const call = (key: string) =>
    eventHeroGet(new NextRequest(`http://localhost/api/media/event-hero?key=${encodeURIComponent(key)}`));

  it('404s application PII, DAM assets, traversal, and empty keys', async () => {
    for (const key of ['applications/ws_1/x.jpg', 'dam/ws_1/x.jpg', 'event-hero/../applications/ws_1/x.jpg', '']) {
      const res = await call(key);
      expect(res.status, `key=${key}`).toBe(404);
    }
  });
});
