'use client';
import { useEffect, useState } from 'react';
import {
  Star,
  Tag,
  FolderInput,
  Download,
  Trash2,
  RotateCcw,
  X,
  Share2,
  UserRound,
  Building2,
  Loader2,
} from 'lucide-react';
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

export function BulkActionBar({
  selectedIds,
  isTrash,
  onDone,
  onClear,
  isWide = true,
  sponsors = [],
}: {
  selectedIds: string[];
  isTrash: boolean;
  onDone: () => void;
  onClear: () => void;
  /** True on md+ viewport — renders the desktop floating bar; false → mobile bottom sheet */
  isWide?: boolean;
  sponsors?: string[];
}) {
  const [folders, setFolders] = useState<FolderOpt[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagText, setTagText] = useState('');
  const [removeTagOpen, setRemoveTagOpen] = useState(false);
  const [removeTagText, setRemoveTagText] = useState('');
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditText, setCreditText] = useState('');
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
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
      const id = setTimeout(() => setSheetVisible(true), 16);
      return () => clearTimeout(id);
    }
  }, [isWide]);

  const closeAllPopovers = () => {
    setTagOpen(false);
    setRemoveTagOpen(false);
    setCreditOpen(false);
    setSponsorOpen(false);
    setMoveOpen(false);
  };

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

  const handleDownload = async () => {
    setIsZipping(true);
    setZipError(null);
    try {
      const res = await fetch('/api/media/dam/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: selectedIds }),
      });
      if (!res.ok) {
        console.error('[BulkActionBar] zip failed', res.status);
        setZipError('Download failed — try with fewer photos at once.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'media-export.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[BulkActionBar] zip error', e);
      setZipError('Download failed — try with fewer photos at once.');
    } finally {
      setIsZipping(false);
    }
  };

  // ------------------------------------------------------------------
  // Shared style helpers
  // ------------------------------------------------------------------

  const desktopBtn =
    'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[13px] disabled:opacity-50 focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2';
  const desktopBtnStyle = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
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
      {/* Mark as best (was Flag) */}
      <button
        className={desktopBtn}
        style={desktopBtnStyle}
        aria-label="Mark selected photos as best"
        disabled={busy}
        onClick={() => run(() => bulk('flagSelect', selectedIds, { value: true }))}
      >
        <Star className="h-4 w-4" /> Mark as best
      </button>

      {/* Add tag */}
      <div className="relative">
        <button
          className={desktopBtn}
          style={desktopBtnStyle}
          aria-label="Add tag to selected photos"
          disabled={busy}
          onClick={() => { closeAllPopovers(); setTagOpen((v) => !v); }}
        >
          <Tag className="h-4 w-4" /> Add tag
        </button>
        {tagOpen && (
          <div
            className="absolute bottom-full left-0 z-50 mb-2 rounded-[8px] p-2"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
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
                if (e.key === 'Escape') setTagOpen(false);
              }}
              placeholder="tag, tag…"
              className="w-40 rounded-[6px] border px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-primary)' }}
            />
          </div>
        )}
      </div>

      {/* Remove tag */}
      <div className="relative">
        <button
          className={desktopBtn}
          style={desktopBtnStyle}
          aria-label="Remove tag from selected photos"
          disabled={busy}
          onClick={() => { closeAllPopovers(); setRemoveTagOpen((v) => !v); }}
        >
          <X className="h-4 w-4" /> Remove tag
        </button>
        {removeTagOpen && (
          <div
            className="absolute bottom-full left-0 z-50 mb-2 rounded-[8px] p-2"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <input
              autoFocus
              value={removeTagText}
              onChange={(e) => setRemoveTagText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && removeTagText.trim()) {
                  const tags = removeTagText.split(',').map((t) => t.trim()).filter(Boolean);
                  setRemoveTagText('');
                  setRemoveTagOpen(false);
                  run(() => bulk('removeTags', selectedIds, { tags }));
                }
                if (e.key === 'Escape') setRemoveTagOpen(false);
              }}
              placeholder="tag to remove"
              className="w-40 rounded-[6px] border px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-primary)' }}
            />
            <button
              className="mt-1 w-full rounded-[5px] px-2 py-1 text-left text-[12px]"
              style={{ color: 'var(--primary)' }}
              onClick={() => {
                if (!removeTagText.trim()) return;
                const tags = removeTagText.split(',').map((t) => t.trim()).filter(Boolean);
                setRemoveTagText('');
                setRemoveTagOpen(false);
                run(() => bulk('removeTags', selectedIds, { tags }));
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Set credit */}
      <div className="relative">
        <button
          className={desktopBtn}
          style={desktopBtnStyle}
          aria-label="Set photographer credit for selected photos"
          disabled={busy}
          onClick={() => { closeAllPopovers(); setCreditOpen((v) => !v); }}
        >
          <UserRound className="h-4 w-4" /> Set credit
        </button>
        {creditOpen && (
          <div
            className="absolute bottom-full left-0 z-50 mb-2 rounded-[8px] p-2"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <input
              autoFocus
              value={creditText}
              onChange={(e) => setCreditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setCreditOpen(false);
                  run(() => bulk('setCredit', selectedIds, { credit: creditText.trim() }));
                  setCreditText('');
                }
                if (e.key === 'Escape') setCreditOpen(false);
              }}
              placeholder="Photographer name"
              className="w-44 rounded-[6px] border px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-primary)' }}
            />
            <button
              className="mt-1 w-full rounded-[5px] px-2 py-1 text-left text-[12px]"
              style={{ color: 'var(--primary)' }}
              onClick={() => {
                setCreditOpen(false);
                run(() => bulk('setCredit', selectedIds, { credit: creditText.trim() }));
                setCreditText('');
              }}
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Set sponsor */}
      <div className="relative">
        <button
          className={desktopBtn}
          style={desktopBtnStyle}
          aria-label="Set sponsor for selected photos"
          disabled={busy}
          onClick={() => { closeAllPopovers(); setSponsorOpen((v) => !v); }}
        >
          <Building2 className="h-4 w-4" /> Set sponsor
        </button>
        {sponsorOpen && (
          <div
            className="absolute bottom-full left-0 z-50 mb-2 rounded-[8px] p-2"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <select
              autoFocus
              className="w-44 rounded-[6px] border px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-primary)' }}
              defaultValue=""
              onChange={(e) => {
                const sponsor = e.target.value;
                setSponsorOpen(false);
                run(() => bulk('setSponsor', selectedIds, { sponsor }));
              }}
            >
              <option value="">— Remove sponsor —</option>
              {sponsors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Move to folder (was Move) */}
      <div className="relative">
        <button
          className={desktopBtn}
          style={desktopBtnStyle}
          aria-label="Move selected photos to folder"
          disabled={busy}
          onClick={() => { closeAllPopovers(); setMoveOpen((v) => !v); }}
        >
          <FolderInput className="h-4 w-4" /> Move to folder
        </button>
        {moveOpen && (
          <div
            className="absolute bottom-full left-0 z-50 mb-2 max-h-60 w-48 overflow-y-auto rounded-[8px] p-1"
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
                className="block w-full truncate rounded-[5px] px-2 py-1 text-left text-[13px]"
                style={{ color: 'var(--text-primary)' }}
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

      {/* Download (was ZIP) */}
      <button
        className={desktopBtn}
        style={desktopBtnStyle}
        aria-label="Download selected photos as ZIP"
        disabled={busy || isZipping}
        onClick={handleDownload}
      >
        {isZipping ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing download…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" /> Download
          </>
        )}
      </button>

      {/* Share */}
      <button
        className={desktopBtn}
        style={desktopBtnStyle}
        aria-label="Share selected photos"
        disabled={busy}
        onClick={() => setShareOpen(true)}
      >
        <Share2 className="h-4 w-4" /> Share
      </button>

      {/* Delete */}
      <button
        className={desktopBtn}
        style={{ ...desktopBtnStyle, color: 'var(--primary)' }}
        aria-label="Delete selected photos"
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
    'flex min-h-[44px] min-w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-[8px] border px-2 py-2 text-[12px] disabled:opacity-50 focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2';
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
        aria-label="Mark selected photos as best"
        disabled={busy}
        onClick={() => run(() => bulk('flagSelect', selectedIds, { value: true }))}
      >
        <Star className="h-5 w-5" />
        Mark as best
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        aria-label="Remove tag from selected photos"
        disabled={busy}
        onClick={() => { closeAllPopovers(); setRemoveTagOpen((v) => !v); }}
      >
        <X className="h-5 w-5" />
        Remove tag
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        aria-label="Set photographer credit for selected photos"
        disabled={busy}
        onClick={() => { closeAllPopovers(); setCreditOpen((v) => !v); }}
      >
        <UserRound className="h-5 w-5" />
        Set credit
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        aria-label="Set sponsor for selected photos"
        disabled={busy}
        onClick={() => { closeAllPopovers(); setSponsorOpen((v) => !v); }}
      >
        <Building2 className="h-5 w-5" />
        Set sponsor
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        aria-label="Download selected photos as ZIP"
        disabled={busy || isZipping}
        onClick={handleDownload}
      >
        {isZipping ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        {isZipping ? 'Preparing…' : 'Download'}
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnStyle}
        aria-label="Share selected photos"
        disabled={busy}
        onClick={() => setShareOpen(true)}
      >
        <Share2 className="h-5 w-5" />
        Share
      </button>
      <button
        className={mobileBtnBase}
        style={mobileBtnDestructive}
        aria-label="Delete selected photos"
        disabled={busy}
        onClick={() => run(() => bulk('softDelete', selectedIds))}
      >
        <Trash2 className="h-5 w-5" />
        Delete
      </button>
    </>
  );

  // ------------------------------------------------------------------
  // Shared overlays (purge confirm, share modal, zip error) — always rendered
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
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none' }}
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
          <div className="flex justify-center pb-2 pt-3">
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
              className="rounded-[6px] p-1.5 focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
              onClick={onClear}
            >
              <X className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
          {/* Zip error */}
          {zipError && (
            <p className="mx-4 mb-2 text-[12px]" style={{ color: 'var(--primary)' }}>
              {zipError}
            </p>
          )}
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
  // Desktop floating bar
  // ------------------------------------------------------------------

  return (
    <>
      <div
        className="fixed bottom-4 left-1/2 z-40 flex w-[min(calc(100vw-2rem),800px)] -translate-x-1/2 flex-col gap-1 rounded-[10px] px-3 py-2 font-[family-name:var(--font-dm-sans)]"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}
      >
        {zipError && (
          <p className="text-[12px]" style={{ color: 'var(--primary)' }}>
            {zipError}{' '}
            <button
              className="underline"
              onClick={() => setZipError(null)}
              style={{ color: 'var(--text-muted)' }}
            >
              Dismiss
            </button>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-1 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {selectedIds.length} selected
          </span>
          {isTrash ? trashActions : normalActions}
          <button
            aria-label="Clear selection"
            className="ml-1 rounded-[6px] p-1.5 focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
            onClick={onClear}
          >
            <X className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
      </div>
      {overlays}
    </>
  );
}
