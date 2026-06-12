'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Folder, Star, Video, Megaphone, Image as ImageIcon, Trash2, FolderPlus, X } from 'lucide-react';

interface FolderNode {
  id: string;
  name: string;
  type: string;
  eventId: string | null;
  parentId: string | null;
}

const TYPE_ICON: Record<string, typeof Folder> = {
  FULL_GALLERY: ImageIcon,
  SELECTS: Star,
  VIDEO: Video,
  SPONSOR: Megaphone,
  BRAND: Folder,
};

/** Evergreen folder sidebar.
 *
 *  Desktop (md+): always-visible left rail.
 *  Mobile: rendered as a fixed full-screen overlay drawer when `mobileOpen` is
 *  true. The parent (MediaWorkspace) controls open/close state.
 *
 *  Sets ?folderId / ?view=trash on the URL. */
export function FolderTree({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [trashCount, setTrashCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const activeFolder = sp.get('folderId');
  const isTrash = sp.get('view') === 'trash';

  // Evergreen is an accent only (icons + active states). Falls back to --primary
  // for white-label themes that don't define the DAM token.
  const accent = 'var(--dam-folder-tree, var(--primary))';
  const accentBg = 'color-mix(in srgb, var(--dam-folder-tree, var(--primary)) 12%, transparent)';

  const loadFolders = useCallback(() => {
    fetch('/api/media/dam/folders')
      .then((r) => r.json())
      .then((d) => {
        setFolders(d.folders ?? []);
        setCounts(d.counts ?? {});
        setTrashCount(d.trashCount ?? 0);
      })
      .catch((e) => console.error('[FolderTree] fetch failed', e));
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const go = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
    // Close mobile drawer after navigation.
    onMobileClose?.();
  };

  const createFolder = async () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      setNewName('');
      return;
    }
    try {
      const res = await fetch('/api/media/dam/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'FULL_GALLERY' }),
      });
      if (res.ok) {
        setNewName('');
        setCreating(false);
        loadFolders();
      } else {
        console.error('[FolderTree] create folder failed', res.status);
      }
    } catch (e) {
      console.error('[FolderTree] create folder error', e);
    }
  };

  const navContent = (
    <nav
      className="flex h-full flex-col gap-1 overflow-y-auto p-3 pb-24 font-[family-name:var(--font-dm-sans)] text-[13px]"
      style={{ background: 'var(--sidebar)', color: 'var(--text-secondary)', boxShadow: 'var(--sidebar-shadow)' }}
    >
      <button
        onClick={() => go({ folderId: null, view: null })}
        className="rounded-[6px] px-2 py-1.5 text-left transition-colors"
        style={
          !activeFolder && !isTrash
            ? { background: accentBg, color: accent, fontWeight: 500 }
            : { color: 'var(--text-secondary)' }
        }
      >
        All Media
      </button>
      {folders.map((f) => {
        const Icon = TYPE_ICON[f.type] ?? Folder;
        const active = activeFolder === f.id;
        return (
          <button
            key={f.id}
            onClick={() => go({ folderId: f.id, view: null })}
            className="flex items-center gap-2 rounded-[6px] py-1.5 pr-2 text-left transition-colors"
            style={{
              paddingLeft: f.parentId ? 20 : 8,
              background: active ? accentBg : 'transparent',
              color: active ? accent : 'var(--text-secondary)',
              fontWeight: active ? 500 : 400,
            }}
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
            <span className="flex-1 truncate">{f.name}</span>
            {counts[f.id] ? (
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {counts[f.id]}
              </span>
            ) : null}
          </button>
        );
      })}
      {creating ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') createFolder();
            else if (e.key === 'Escape') {
              setCreating(false);
              setNewName('');
            }
          }}
          onBlur={createFolder}
          placeholder="Folder name…"
          className="rounded-[6px] border px-2 py-1.5 text-[13px]"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-primary)' }}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <FolderPlus className="h-4 w-4 shrink-0" style={{ color: accent }} />
          <span className="flex-1">New folder</span>
        </button>
      )}
      <button
        onClick={() => go({ view: 'trash', folderId: null })}
        className="mt-auto flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors"
        style={{
          background: isTrash ? accentBg : 'transparent',
          color: isTrash ? accent : 'var(--text-secondary)',
          fontWeight: isTrash ? 500 : 400,
        }}
      >
        <Trash2 className="h-4 w-4 shrink-0" style={{ color: accent }} />
        <span className="flex-1">Trash</span>
        {trashCount ? (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {trashCount}
          </span>
        ) : null}
      </button>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar — always visible at md+ */}
      <div className="hidden h-full w-[240px] shrink-0 md:block">
        {navContent}
      </div>

      {/* Mobile drawer overlay — controlled by mobileOpen prop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={onMobileClose}
          aria-modal="true"
          role="dialog"
          aria-label="Folders"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Drawer panel */}
          <div
            className="absolute inset-y-0 left-0 w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute right-2 top-2 z-10">
              <button
                aria-label="Close folders"
                className="rounded-full p-2"
                onClick={onMobileClose}
                style={{ background: 'var(--card)', color: 'var(--text-secondary)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-full">
              {navContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
