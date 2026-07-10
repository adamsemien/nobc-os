'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export function DeleteSegmentButton({
  segmentId,
  segmentName,
}: {
  segmentId: string;
  segmentName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/segments/${segmentId}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not delete this segment.');
        return;
      }
      router.push('/operator/segments');
    } catch {
      setError('Could not delete this segment.');
    } finally {
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium"
        style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete segment
      </button>
    );
  }

  return (
    <div className="rounded-md border px-3 py-2.5" style={{ borderColor: 'var(--danger)' }}>
      <p className="text-xs text-text-primary">
        Delete &quot;{segmentName}&quot;? This can&apos;t be undone.
      </p>
      {error ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={deleting}
          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--danger)' }}
        >
          {deleting ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
