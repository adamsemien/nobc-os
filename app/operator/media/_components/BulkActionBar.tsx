'use client';
import { useEffect, useState } from 'react';
import { Star, Tag, FolderInput, Download, Trash2, RotateCcw, X } from 'lucide-react';

interface FolderOpt {
  id: string;
  name: string;
}

async function bulk(action: string, assetIds: string[], extra: Record<string, unknown> = {}): Promise<boolean> {
  const res = await fetch('/api/media/dam/assets/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, assetIds, ...extra }),
  });
  if (!res.ok) console.error('[BulkActionBar] bulk failed', action, res.status);
  return res.ok;
}

async function downloadZip(assetIds: string[]): Promise<void> {
  try {
    const res = await fetch('/api/media/dam/download-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetIds }),
    });
    if (!res.ok) {
      console.error('[BulkActionBar] zip failed', res.status);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nobc-media.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('[BulkActionBar] zip error', e);
  }
}

/** Persistent bottom bar shown when ≥1 asset is selected. */
export function BulkActionBar({
  selectedIds,
  isTrash,
  onDone,
  onClear,
}: {
  selectedIds: string[];
  isTrash: boolean;
  onDone: () => void;
  onClear: () => void;
}) {
  const [folders, setFolders] = useState<FolderOpt[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagText, setTagText] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/media/dam/folders')
      .then((r) => r.json())
      .then((d) => setFolders(d.folders ?? []))
      .catch(() => {});
  }, []);

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
    onDone();
  };

  const btn = 'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[13px] disabled:opacity-50';
  const btnStyle = { background: 'var(--card)', border: '1px solid var(--border)' } as const;

  return (
    <>
      <div
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-[10px] px-3 py-2 font-[family-name:var(--font-dm-sans)]"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
      >
        <span className="px-1 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {selectedIds.length} selected
        </span>
        {isTrash ? (
          <>
            <button className={btn} style={btnStyle} disabled={busy} onClick={() => run(() => bulk('restore', selectedIds))}>
              <RotateCcw className="h-4 w-4" /> Restore
            </button>
            <button className={btn} style={{ ...btnStyle, color: 'var(--primary)' }} disabled={busy} onClick={() => setConfirmPurge(true)}>
              <Trash2 className="h-4 w-4" /> Delete forever
            </button>
          </>
        ) : (
          <>
            <button className={btn} style={btnStyle} disabled={busy} onClick={() => run(() => bulk('flagSelect', selectedIds, { value: true }))}>
              <Star className="h-4 w-4" /> Flag
            </button>
            <div className="relative">
              <button className={btn} style={btnStyle} disabled={busy} onClick={() => { setTagOpen((v) => !v); setMoveOpen(false); }}>
                <Tag className="h-4 w-4" /> Add tag
              </button>
              {tagOpen && (
                <div className="absolute bottom-full left-0 mb-2 rounded-[8px] p-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <input
                    autoFocus
                    value={tagText}
                    onChange={(e) => setTagText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagText.trim()) {
                        const tags = tagText.split(',').map((t) => t.trim()).filter(Boolean);
                        setTagText('');
                        setTagOpen(false);
                        run(() => bulk('addTags', selectedIds, { tags }));
                      }
                    }}
                    placeholder="tag, tag…"
                    className="w-40 rounded-[6px] border px-2 py-1 text-[13px]"
                    style={{ borderColor: 'var(--border)' }}
                  />
                </div>
              )}
            </div>
            <div className="relative">
              <button className={btn} style={btnStyle} disabled={busy} onClick={() => { setMoveOpen((v) => !v); setTagOpen(false); }}>
                <FolderInput className="h-4 w-4" /> Move
              </button>
              {moveOpen && (
                <div className="absolute bottom-full left-0 mb-2 max-h-60 w-48 overflow-y-auto rounded-[8px] p-1" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  {folders.length === 0 && (
                    <div className="px-2 py-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>No folders</div>
                  )}
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      className="block w-full truncate rounded-[5px] px-2 py-1 text-left text-[13px] hover:bg-[var(--raised)]"
                      onClick={() => { setMoveOpen(false); run(() => bulk('move', selectedIds, { folderId: f.id })); }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className={btn} style={btnStyle} disabled={busy} onClick={() => run(() => downloadZip(selectedIds))}>
              <Download className="h-4 w-4" /> ZIP
            </button>
            <button className={btn} style={btnStyle} disabled={busy} onClick={() => run(() => bulk('softDelete', selectedIds))}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </>
        )}
        <button aria-label="Clear selection" className="ml-1 rounded-[6px] p-1.5" onClick={onClear}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {confirmPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmPurge(false)}>
          <div
            className="w-[340px] rounded-[12px] p-5 font-[family-name:var(--font-dm-sans)]"
            style={{ background: 'var(--card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Delete {selectedIds.length} {selectedIds.length === 1 ? 'asset' : 'assets'} forever?
            </h3>
            <p className="mb-4 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              This permanently removes the files from storage and cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button className={btn} style={btnStyle} onClick={() => setConfirmPurge(false)}>
                Cancel
              </button>
              <button
                className={btn}
                style={{ background: 'var(--primary)', color: '#fff' }}
                disabled={busy}
                onClick={() => { setConfirmPurge(false); run(() => bulk('permanentDelete', selectedIds)); }}
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
