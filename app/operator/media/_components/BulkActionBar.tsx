'use client';
import { useEffect, useState } from 'react';
import { Star, Tag, FolderInput, Download, Trash2, RotateCcw, X, Share2 } from 'lucide-react';
import { CreateShareModal } from './CreateShareModal';

interface FolderOpt {
  id: string;
  name: string;
}

async function bulk(
  action: string,
  assetIds: string[],
  extra: Record<string, unknown> = {},
): Promise<boolean> {
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

export function BulkActionBar({
  selectedIds,
  isTrash,
  onDone,
  onClear,
  isWide = true,
}: {
  selectedIds: string[];
  isTrash: boolean;
  onDone: () => void;
  onClear: () => void;
  /** True on md+ viewport — renders the desktop floating bar; false → mobile bottom sheet */
  isWide?: boolean;
}) {
  const [folders, setFolders] = useState<FolderOpt[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagText, setTagText] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Controls the slide-up animation for the mobile sheet
  const [sheetVisible, setSheetVisible] = useState(false);

  useEffect(() => {
    fetch('/api/media/dam/folders')
      .then((r) => r.json())
      .then((d) => setFolders(d.folders ?? []))
      .catch((e) => console.error('[BulkActionBar] folders fetch error', e));
  }, []);

  // Trigger slide-up animation on mount (mobile sheet only)
  useEffect(() => {
    if (!isWide) {
      // Use a small delay so the initial translateY(100%) paints before we
      // set visible=true and the CSS transition fires.
      const id = setTimeout(() => setSheetVisible(true), 16);
      return () => clearTimeout(id);
    }
  }, [isWide]);

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      console.error('[BulkActionBar] run error', e);
    } finally {
      setBusy(false);
    }
    onDone();
  };

  // ------------------------------------------------------------------
  // Shared style helpers
  // ------------------------------------------------------------------

  const desktopBtn =
    'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[13px] disabled:opacity-50';
  const desktopBtnStyle = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
  } as const;

  // ------------------------------------------------------------------
  // Desktop action sets
  // ------------------------------------------------------------------

  const trashActions = (
    <>
      <button
        className={desktopBtn}
        style={desktopBtnStyle}
        disabled={busy}
        onClick={() => run(() => bulk('restore', selectedIds))}
      >
        <RotateCcw className="h-4 w-4" /> Restore
      </button>
      <button
        className={desktopBtn}
        style={{ ...desktopBtnStyle, color: 'var(--primary)' }}
        disabled={busy}
        onClick={() => setConfirmPurge(true)}
      >
        <Trash2 className="h-4 w-4" /> Delete forever
      </button>
    </>
  );

  const normalActions = (
    <>
      <button
        className={desktopBtn}
        style={desktopBtnStyle}
        disabled={busy}
        onClick={() => run(() => bulk('flagSelect', selectedIds, { value: true }))}
      >
        <Star className="h-4 w-4" /> Flag
      </button>
      <div className="relative">
        <button
          className={desktopBtn}
          style={desktopBtnStyle}
          disabled={busy}
          onClick={() => {
            setTagOpen((v) => !v);
            setMoveOpen(false);
          }}
        >
          <Tag className="h-4 w-4" /> Add tag
        </button>
        {tagOpen && (
          <div
            className="absolute bottom-full left-0 mb-2 rounded-[8px] p-2"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <input
              autoFocus
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagText.trim()) {
                  const tags = tagText
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean);
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
        <button
          className={desktopBtn}
          style={desktopBtnStyle}
          disabled={busy}
          onClick={() => {
            setMoveOpen((v) => !v);
            setTagOpen(false);
          }}
        >
          <FolderInput className="h-4 w-4" /> Move
        </button>
        {moveOpen && (
          <div
            className="absolute bottom-full left-0 mb-2 max-h-60 w-48 overflow-y-auto rounded-[8px] p-1"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            {folders.length === 0 && (
              <div className="px-2 py-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                No folders
              </div>
            )}
            {folders.map((f) => (
              <button
                key={f.id}
                className="block w-full truncate rounded-[5px] px-2 py-1 text-left text-[13px] hover:bg-[var(--raised)]"
                onClick={() => {
                  setMoveOpen(false);
                  run(() => bulk('move', selectedIds, { folderId: f.id }));
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className={desktopBtn}
        style={desktopBtnStyle}
        disabled={busy}
        onClick={() => run(() => downloadZip(selectedIds))}
      >
        <Download className="h-4 w-4" /> ZIP
      </button>
      <button
        className={desktopBtn}
        style={desktopBtnStyle}
        disabled={busy}
        onClick={() => setShareOpen(true)}
      >
        <Share2 className="h-4 w-4" /> Share
      </button>
      <button
        className={desktopBtn}
        style={desktopBtnStyle}
        disabled={busy}
        onClick={() => run(() => bulk('softDelete', selectedIds))}
      >
        <Trash2 className="h-4 w-4" /> Delete
      </button>
    </>
  );

  // ------------------------------------------------------------------
  // Mobile-sheet action buttons
  // ------------------------------------------------------------------

  const mobileBtnBase =
    'flex min-h-[44px] min-w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-[8px] border px-2 py-2 text-[12px] disabled:opacity-50';
  const mobileBtnStyle = {
    background: 'var(--card)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  } as const;
  const mobileBtnDestructive = {
    background: 'var(--card)',
    borderColor: 'var(--border)',
    color: 'var(--primary)',
  } as const;

  const mobileTrashActions = (
    <>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        disabled={busy}
        onClick={() => run(() => bulk('restore', selectedIds))}
      >
        <RotateCcw className="h-5 w-5" />
        Restore
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnDestructive}
        disabled={busy}
        onClick={() => setConfirmPurge(true)}
      >
        <Trash2 className="h-5 w-5" />
        Delete forever
      </button>
    </>
  );

  const mobileNormalActions = (
    <>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        disabled={busy}
        onClick={() => run(() => bulk('flagSelect', selectedIds, { value: true }))}
      >
        <Star className="h-5 w-5" />
        Flag
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        disabled={busy}
        onClick={() => run(() => downloadZip(selectedIds))}
      >
        <Download className="h-5 w-5" />
        ZIP
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        disabled={busy}
        onClick={() => setShareOpen(true)}
      >
        <Share2 className="h-5 w-5" />
        Share
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnDestructive}
        disabled={busy}
        onClick={() => run(() => bulk('softDelete', selectedIds))}
      >
        <Trash2 className="h-5 w-5" />
        Delete
      </button>
    </>
  );

  // ------------------------------------------------------------------
  // Shared overlays (purge confirm, share modal) — always rendered
  // ------------------------------------------------------------------

  const overlays = (
    <>
      {shareOpen && (
        <CreateShareModal
          selectedIds={selectedIds}
          onClose={() => setShareOpen(false)}
          onCreated={onDone}
        />
      )}
      {confirmPurge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmPurge(false)}
        >
          <div
            className="w-[min(340px,calc(100vw-2rem))] rounded-[12px] p-5 font-[family-name:var(--font-dm-sans)]"
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
              <button
                className={desktopBtn}
                style={desktopBtnStyle}
                onClick={() => setConfirmPurge(false)}
              >
                Cancel
              </button>
              <button
                className={desktopBtn}
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                disabled={busy}
                onClick={() => {
                  setConfirmPurge(false);
                  run(() => bulk('permanentDelete', selectedIds));
                }}
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ------------------------------------------------------------------
  // Mobile bottom sheet
  // ------------------------------------------------------------------

  if (!isWide) {
    return (
      <>
        <div
          className="fixed bottom-0 left-0 right-0 z-40 rounded-[16px_16px_0_0] font-[family-name:var(--font-dm-sans)] motion-reduce:transition-none"
          style={{
            background: 'var(--card)',
            borderTop: '1px solid var(--border)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div
              className="h-[4px] w-[40px] rounded-full"
              style={{ background: 'var(--border-strong)' }}
            />
          </div>
          {/* Count + close row */}
          <div className="flex items-center justify-between px-4 pb-2">
            <span
              className="text-[14px] font-medium"
              style={{ color: 'var(--primary)' }}
              aria-live="polite"
            >
              {selectedIds.length} selected
            </span>
            <button
              aria-label="Clear selection"
              className="rounded-[6px] p-1.5"
              onClick={onClear}
            >
              <X className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
          {/* Horizontal-scrollable action row */}
          <div className="flex gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {isTrash ? mobileTrashActions : mobileNormalActions}
          </div>
        </div>
        {overlays}
      </>
    );
  }

  // ------------------------------------------------------------------
  // Desktop floating bar (unchanged layout)
  // ------------------------------------------------------------------

  return (
    <>
      <div
        className="fixed bottom-4 left-1/2 z-40 flex w-[min(calc(100vw-2rem),640px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-[10px] px-3 py-2 font-[family-name:var(--font-dm-sans)]"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}
      >
        <span className="px-1 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {selectedIds.length} selected
        </span>
        {isTrash ? trashActions : normalActions}
        <button
          aria-label="Clear selection"
          className="ml-1 rounded-[6px] p-1.5"
          onClick={onClear}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {overlays}
    </>
  );
}
