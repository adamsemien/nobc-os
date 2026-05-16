'use client';

import { useState } from 'react';

interface EventDraft {
  title: string;
  description: string;
  runOfShow: string[];
  suggestedLocation?: string;
  suggestedStartTime?: string;
}

export function EventBuilderButton() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [error, setError] = useState('');

  async function generate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');
    setDraft(null);
    try {
      const res = await fetch('/api/agent/event-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const { draft: d } = (await res.json()) as { draft: EventDraft };
      setDraft(d);
    } catch {
      setError('Generation failed. Check that ANTHROPIC_API_KEY is set.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 14px',
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          color: 'var(--color-text-primary)',
          fontSize: 13,
          cursor: 'pointer',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ✦ AI Event Builder
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
          onClick={e => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            style={{
              background: 'var(--color-surface, #fff)',
              borderRadius: 12,
              padding: '28px 24px',
              width: '100%',
              maxWidth: 560,
              maxHeight: '90dvh',
              overflowY: 'auto',
              boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-playfair-display, Georgia, serif)',
                fontSize: 22,
                fontWeight: 600,
                marginBottom: 4,
                color: 'var(--color-text-primary)',
              }}
            >
              AI Event Builder
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Describe your event concept and get copy ready to paste.
            </p>

            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Intimate dinner with 12 founders in a wine cellar, focused on what they're building next…"
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                fontSize: 13,
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                color: 'var(--color-text-primary)',
                background: 'var(--color-bg)',
              }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                style={{
                  padding: '9px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--primary)',
                  color: 'var(--on-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading || !prompt.trim() ? 0.6 : 1,
                }}
              >
                {loading ? 'Generating…' : 'Generate'}
              </button>
              <button
                onClick={() => { setOpen(false); setDraft(null); setPrompt(''); }}
                style={{
                  padding: '9px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'none',
                  fontSize: 13,
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Cancel
              </button>
            </div>

            {error && (
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-error, #dc2626)' }}>{error}</p>
            )}

            {draft && (
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DraftField label="Title" value={draft.title} />
                <DraftField label="Description" value={draft.description} multiline />
                <DraftField label="Run of Show" value={draft.runOfShow.map((s, i) => `${i + 1}. ${s}`).join('\n')} multiline />
                {draft.suggestedLocation && <DraftField label="Suggested Location" value={draft.suggestedLocation} />}
                {draft.suggestedStartTime && <DraftField label="Suggested Start" value={draft.suggestedStartTime} />}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function DraftField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
          {label}
        </span>
        <button
          onClick={copy}
          style={{ fontSize: 11, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {multiline ? (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-primary)', margin: 0 }}>
          {value}
        </pre>
      ) : (
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>{value}</p>
      )}
    </div>
  );
}
