'use client';

import { useEffect, useState } from 'react';

export default function WebhooksPage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/operator/settings/webhooks')
      .then(r => r.json())
      .then((d: { token?: string; error?: string }) => {
        if (d.token) setToken(d.token);
        else setError(d.error ?? 'Could not load webhook portal');
      })
      .catch(() => setError('Network error'));
  }, []);

  useEffect(() => {
    if (!token) return;
    // Svix AppPortal embed SDK
    const script = document.createElement('script');
    script.src = 'https://cdn.svix.com/app-portal/v1/index.js';
    script.async = true;
    script.onload = () => {
      const w = window as unknown as { SvixAppPortal?: { mount: (token: string, el: Element) => void } };
      const el = document.getElementById('svix-portal');
      if (w.SvixAppPortal && el) {
        w.SvixAppPortal.mount(token, el);
      }
    };
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [token]);

  return (
    <div className="px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <h1
          className="mb-2 text-3xl font-normal text-text-primary"
          style={{ fontFamily: 'var(--font-playfair-display), Georgia, serif' }}
        >
          Webhooks
        </h1>
        <p className="mb-8 text-sm text-text-muted">
          Subscribe to NoBC OS events and deliver them to your own endpoints.
        </p>

        {error && (
          <div className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {!token && !error && (
          <p className="text-sm text-text-muted">Loading webhook portal…</p>
        )}

        <div id="svix-portal" style={{ minHeight: 500 }} />
      </div>
    </div>
  );
}
