'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = {
  slug: string;
};

export function CopyInviteLinkButton({ slug }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      const url = `${window.location.origin}/m/events/${slug}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore — clipboard API can fail in restricted contexts.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--apply-rule)] bg-card px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : 'Copy Invite Link'}
    </button>
  );
}
