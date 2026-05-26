'use client';
import { useCallback, useState, type DragEvent, type ReactNode } from 'react';

interface QueueItem {
  id: string;
  name: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

interface QueuedFile {
  file: File;
  path: string;
}

/** Wraps the grid area; drag files or a folder to batch-upload (folders auto-created). */
export function UploadDropzone({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

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

      const items: QueueItem[] = files.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.file.name, status: 'pending' }));
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
                const res = await fetch('/api/media/dam/upload', { method: 'POST', body: fd });
                setQueue((q) => q.map((it) => (it.id === item.id ? { ...it, status: res.ok ? 'done' : 'error' } : it)));
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
      setTimeout(() => setQueue([]), 2500);
    },
    [onDone],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
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

  return (
    <div
      className="relative flex-1"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      {children}
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed"
          style={{ borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
        >
          <span className="font-[family-name:var(--font-dm-sans)] text-[15px]" style={{ color: 'var(--primary)' }}>
            Drop photos to upload
          </span>
        </div>
      )}
      {queue.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-40 max-h-72 w-72 overflow-y-auto rounded-[10px] p-3 font-[family-name:var(--font-dm-sans)]"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
        >
          <div className="mb-2 text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
            Uploading {queue.filter((q) => q.status === 'done').length}/{queue.length}
          </div>
          {queue.map((it) => (
            <div key={it.id} className="mb-1 flex items-center gap-2 text-[12px]">
              <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{it.name}</span>
              <span style={{ color: it.status === 'error' ? 'var(--primary)' : 'var(--text-muted)' }}>
                {it.status === 'done' ? '✓' : it.status === 'error' ? '✕' : '…'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
