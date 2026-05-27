'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Folder, Star, Video, Megaphone, Image as ImageIcon, Trash2 } from 'lucide-react';

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

/** Evergreen folder sidebar. Sets ?folderId / ?view=trash on the URL. */
export function FolderTree() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [trashCount, setTrashCount] = useState(0);
  const activeFolder = sp.get('folderId');
  const isTrash = sp.get('view') === 'trash';

  // Evergreen is an accent only (icons + active states). Falls back to --primary
  // for white-label themes that don't define the DAM token.
  const accent = 'var(--dam-folder-tree, var(--primary))';
  const accentBg = 'color-mix(in srgb, var(--dam-folder-tree, var(--primary)) 12%, transparent)';

  useEffect(() => {
    fetch('/api/media/dam/folders')
      .then((r) => r.json())
      .then((d) => {
        setFolders(d.folders ?? []);
        setCounts(d.counts ?? {});
        setTrashCount(d.trashCount ?? 0);
      })
      .catch((e) => console.error('[FolderTree] fetch failed', e));
  }, []);

  const go = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <nav
      className="flex h-full w-[240px] shrink-0 flex-col gap-1 overflow-y-auto p-3 font-[family-name:var(--font-dm-sans)] text-[13px]"
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
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {counts[f.id]}
              </span>
            ) : null}
          </button>
        );
      })}
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
}
