'use client';

import { useState } from 'react';

export function SponsorBriefBar() {
  const [showToast, setShowToast] = useState(false);

  const onGenerate = () => {
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 2600);
  };

  return (
    <>
      <div className="border-t" style={{ borderColor: 'var(--border)' }} />
      <div className="flex items-center justify-between py-8">
        <span
          className="text-[11px] uppercase"
          style={{ letterSpacing: '0.22em', color: 'var(--text-secondary)' }}
        >
          Sponsor Brief
        </span>
        <button
          type="button"
          onClick={onGenerate}
          className="btn-shimmer px-6 py-3 text-[11px] uppercase"
          style={{
            letterSpacing: '0.2em',
            background: 'var(--accent)',
            color: 'var(--on-primary)',
            borderRadius: '2px',
          }}
        >
          Generate One-Sheeter
        </button>
      </div>

      {showToast && (
        <div
          role="status"
          className="toast-in fixed bottom-6 right-6 z-[9999] px-5 py-3 text-[13px]"
          style={{ background: 'var(--text-primary)', color: 'var(--bg)', borderRadius: '4px' }}
        >
          Sponsor brief generation coming in V1.5
        </div>
      )}
    </>
  );
}
