'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { UploadCloud, X } from 'lucide-react';

/** Imperative upload trigger shared with the toolbar button + empty-state CTA. */
interface UploadApi {
  open: () => void;
  isUploading: boolean;
}
const UploadContext = createContext<UploadApi>({ open: () => {}, isUploading: false });
export const useUpload = () => useContext(UploadContext);

/**
 * File-picker accept list. JPEG/PNG/WebP map to the upload route's ALLOWED set;
 * HEIC/HEIF are accepted via the route's separate isHeic path (converted to JPEG
 * server-side), not ALLOWED. Keep in sync with /api/media/dam/upload.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

interface QueueItem {
  id: string;
  name: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number; // 0..1
  previewUrl?: string;
}

interface QueuedFile {
  file: File;
  path: string;
}

/** POST one file with real upload progress (fetch can't report it; XHR can). */
function putUpload(fd: FormData, onProgress: (p: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/dam/upload');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(fd);
  });
}

/**
 * Wraps the grid area. Drag files or folders anywhere on the page, paste from the
 * clipboard, or click the Browse/Upload affordances (via {@link useUpload}) to
 * batch-upload. Folders are auto-created. Live progress shows in a bottom-right tray.
 */
export function UploadDropzone({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);
  const batchRef = useRef(0);
  const dragDepth = useRef(0);

  const clearQueue = useCallback(() => {
    urlsRef.current.forEach(URL.revokeObjectURL);
    urlsRef.current = [];
    setQueue([]);
  }, []);

  // Revoke any outstanding preview object URLs on unmount.
  useEffect(() => () => urlsRef.current.forEach(URL.revokeObjectURL), []);

  const upload = useCallback(
    async (files: QueuedFile[]) => {
      const folderCache = new Map<string, string>();
      const ensureFolder = async (dir: string): Promise<string | undefined> => {
        if (!dir) return undefined;
        const cached = folderCache.get(dir);
        if (cached) return cached;
        const name = dir.split('/').filter(Boolean).pop() || dir;
        try {
          const res = await fetch('/api/media/dam/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type: 'FULL_GALLERY' }),
          });
          if (res.ok) {
            const { folder } = await res.json();
            folderCache.set(dir, folder.id);
            return folder.id;
          }
        } catch (e) {
          console.error('[UploadDropzone] folder create failed', e);
        }
        return undefined;
      };

      const myBatch = ++batchRef.current;
      const items: QueueItem[] = files.map((f, i) => {
        const previewUrl = f.file.type.startsWith('image/') ? URL.createObjectURL(f.file) : undefined;
        if (previewUrl) urlsRef.current.push(previewUrl);
        return { id: `${Date.now()}-${i}`, name: f.file.name, status: 'pending', progress: 0, previewUrl };
      });
      setQueue(items);

      const CONCURRENCY = 4;
      let idx = 0;
      let active = 0;
      await new Promise<void>((resolve) => {
        const pump = () => {
          if (idx >= files.length && active === 0) return resolve();
          while (active < CONCURRENCY && idx < files.length) {
            const myIdx = idx++;
            const { file, path } = files[myIdx];
            const item = items[myIdx];
            active++;
            (async () => {
              setQueue((q) => q.map((it) => (it.id === item.id ? { ...it, status: 'uploading' } : it)));
              try {
                const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
                const folderId = await ensureFolder(dir);
                const fd = new FormData();
                fd.append('file', file);
                if (folderId) fd.append('folderId', folderId);
                const ok = await putUpload(fd, (p) =>
                  setQueue((q) => q.map((it) => (it.id === item.id ? { ...it, progress: p } : it))),
                );
                setQueue((q) =>
                  q.map((it) =>
                    it.id === item.id ? { ...it, status: ok ? 'done' : 'error', progress: ok ? 1 : it.progress } : it,
                  ),
                );
              } catch (e) {
                console.error('[UploadDropzone] upload failed', e);
                setQueue((q) => q.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
              } finally {
                active--;
                pump();
              }
            })();
          }
        };
        pump();
      });

      onDone();
      // Auto-dismiss only if no newer batch has started in the meantime.
      setTimeout(() => {
        if (batchRef.current === myBatch) clearQueue();
      }, 3000);
    },
    [onDone, clearQueue],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const out: QueuedFile[] = [];
      const items = e.dataTransfer.items;

      const walk = (entry: FileSystemEntry, prefix: string): Promise<void> =>
        new Promise((resolve) => {
          if (entry.isFile) {
            (entry as FileSystemFileEntry).file((f) => {
              out.push({ file: f, path: prefix + entry.name });
              resolve();
            });
          } else if (entry.isDirectory) {
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            reader.readEntries((entries) => {
              Promise.all(entries.map((en) => walk(en, `${prefix}${entry.name}/`))).then(() => resolve());
            });
          } else {
            resolve();
          }
        });

      if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
        const entries = Array.from(items)
          .map((it) => it.webkitGetAsEntry())
          .filter((en): en is FileSystemEntry => !!en);
        Promise.all(entries.map((en) => walk(en, ''))).then(() => {
          if (out.length) upload(out);
        });
      } else {
        const files = Array.from(e.dataTransfer.files);
        if (files.length) upload(files.map((f) => ({ file: f, path: f.name })));
      }
    },
    [upload],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) upload(files.map((f) => ({ file: f, path: f.name })));
      e.target.value = ''; // allow re-selecting the same file(s)
    },
    [upload],
  );

  const open = useCallback(() => inputRef.current?.click(), []);

  // Paste images straight from the clipboard (⌘V / Ctrl+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) upload(files.map((f) => ({ file: f, path: f.name })));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [upload]);

  const isUploading = queue.some((q) => q.status === 'pending' || q.status === 'uploading');
  const doneCount = queue.filter((q) => q.status === 'done').length;

  return (
    <div
      className="relative flex-1 min-w-0"
      // Depth counter so child dragenter/leave don't flicker the overlay.
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={onPick} />
      <UploadContext.Provider value={{ open, isUploading }}>{children}</UploadContext.Provider>

      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center backdrop-blur-[2px]"
          style={{ background: 'color-mix(in srgb, var(--background) 55%, transparent)' }}
        >
          <div
            className="flex flex-col items-center gap-3 rounded-[16px] border-2 border-dashed px-12 py-9"
            style={{
              borderColor: 'var(--primary)',
              background: 'color-mix(in srgb, var(--primary) 8%, var(--card))',
            }}
          >
            <UploadCloud className="h-10 w-10" style={{ color: 'var(--primary)' }} />
            <span
              className="font-[family-name:var(--font-dm-sans)] text-[16px] font-medium"
              style={{ color: 'var(--primary)' }}
            >
              Drop photos &amp; folders to upload
            </span>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-40 max-h-[60vh] w-80 overflow-y-auto rounded-[12px] p-3 font-[family-name:var(--font-dm-sans)]"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {isUploading ? `Uploading ${doneCount}/${queue.length}` : `Uploaded ${doneCount}/${queue.length}`}
            </span>
            <button
              type="button"
              onClick={clearQueue}
              aria-label="Dismiss"
              className="rounded-[6px] p-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {queue.map((it) => (
            <div key={it.id} className="mb-2 flex items-center gap-2.5">
              <span
                className="h-9 w-9 shrink-0 overflow-hidden rounded-[6px]"
                style={{ background: 'var(--muted, var(--border))' }}
              >
                {it.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {it.name}
                  </span>
                  <span
                    className="text-[12px]"
                    style={{ color: it.status === 'error' ? 'var(--primary)' : 'var(--text-muted)' }}
                  >
                    {it.status === 'done' ? '✓' : it.status === 'error' ? '✕' : `${Math.round(it.progress * 100)}%`}
                  </span>
                </div>
                <div
                  className="mt-1 h-1 overflow-hidden rounded-full"
                  style={{ background: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${(it.status === 'done' ? 1 : it.progress) * 100}%`,
                      background: it.status === 'error' ? 'var(--primary)' : 'var(--primary)',
                      opacity: it.status === 'error' ? 0.4 : 1,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
