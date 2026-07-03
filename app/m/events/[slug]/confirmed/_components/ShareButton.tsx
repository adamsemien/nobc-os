'use client';

import { useState } from 'react';

export default function ShareButton({ url, eventTitle }: { url: string; eventTitle: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: eventTitle, url });
        return;
      } catch {
        // user dismissed — fall through to clipboard
      }
    }
    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      style={{
        width: '100%',
        padding: '13px 20px',
        background: 'transparent',
        color: 'var(--ev-ink, #1a1a1a)',
        border: '1px solid var(--ev-rule, #E0DDD5)',
        borderRadius: '6px',
        cursor: 'pointer',
        fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
        fontSize: '0.875rem',
        fontWeight: 500,
        letterSpacing: '0.01em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'border-color 0.15s',
      }}
    >
      <ShareIcon />
      {copied ? 'Link copied' : 'Share event'}
    </button>
  );
}

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
