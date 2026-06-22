'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Folder,
  Star,
  Video,
  Megaphone,
  Image as ImageIcon,
  Clock,
  Trash2,
  FolderPlus,
  GripVertical,
  X,
  Bookmark,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useSavedSearches } from './useSavedSearches';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FolderNode {
  id: string;
  name: string;
  type: string;
  eventId: string | null;
  parentId: string | null;
  createdAt: string;
}

type SmartCounts = { photos: number; videos: number; selects: number; recent: number };
type FolderSort = 'manual' | 'name' | 'newest';

const TYPE_ICON: Record<string, typeof Folder> = {
  FULL_GALLERY: ImageIcon,
  SELECTS: Star,
  VIDEO: Video,
  SPONSOR: Megaphone,
  BRAND: Folder,
};

// Evergreen "smart" folders — virtual filters over the existing asset query, not
// stored MediaFolder rows. Each clears the smart namespace + folderId, then sets
// its own URL param; the grid (which forwards the full query string to the assets
// API) refetches automatically.
const SMART_CLEAR = { fileType: null, isSelect: null, recent: null } as const;
const SMART: {
  key: string;
  label: string;
  Icon: typeof Folder;
  params: Record<string, string>;
  countKey: keyof SmartCounts;
}[] = [
  { key: 'pictures', label: 'All Pictures', Icon: ImageIcon, params: { fileType: 'PHOTO' }, countKey: 'photos' },
  { key: 'videos', label: 'All Videos', Icon: Video, params: { fileType: 'VIDEO' }, countKey: 'videos' },
  { key: 'selects', label: 'Selects', Icon: Star, params: { isSelect: 'true' }, countKey: 'selects' },
  { key: 'recent', label: 'Recent', Icon: Clock, params: { recent: '1' }, countKey: 'recent' },
];

/** Evergreen folder sidebar.
 *
 *  Desktop (md+): always-visible left rail.
 *  Mobile: rendered as a fixed full-screen overlay drawer when `mobileOpen` is
 *  true. The parent (MediaWorkspace) controls open/close state.
 *
 *  Sets ?folderId / ?view=trash / smart-folder params on the URL. */
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
  const [smartCounts, setSmartCounts] = useState<SmartCounts>({ photos: 0, videos: 0, selects: 0, recent: 0 });
  const [trashCount, setTrashCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [folderSort, setFolderSort] = useState<FolderSort>('manual');
  const [savedViewsOpen, setSavedViewsOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const { saved, rename, remove } = useSavedSearches();

  const activeFolder = sp.get('folderId');
  const isTrash = sp.get('view') === 'trash';
  const activeFileType = sp.get('fileType');
  const activeIsSelect = sp.get('isSelect') === 'true';
  const activeRecent = sp.get('recent') === '1' || sp.get('recent') === 'true';
  const activeSmart =
    activeFolder || isTrash
      ? null
      : activeFileType === 'PHOTO'
        ? 'pictures'
        : activeFileType === 'VIDEO'
          ? 'videos'
          : activeIsSelect
            ? 'selects'
            : activeRecent
              ? 'recent'
              : null;
  const allMediaActive = !activeFolder && !isTrash && !activeSmart;

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
        setSmartCounts(d.smartCounts ?? { photos: 0, videos: 0, selects: 0, recent: 0 });
        setTrashCount(d.trashCount ?? 0);
      })
      .catch((e) => console.error('[FolderTree] fetch failed', e));
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Persist the chosen folder-sort mode across sessions (matches density/view-mode).
  useEffect(() => {
    const saved = localStorage.getItem('dam:folderSort');
    if (saved === 'manual' || saved === 'name' || saved === 'newest') setFolderSort(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem('dam:folderSort', folderSort);
  }, [folderSort]);

  const displayFolders = useMemo(() => {
    if (folderSort === 'name') return [...folders].sort((a, b) => a.name.localeCompare(b.name));
    if (folderSort === 'newest') return [...folders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return folders; // manual: API order (sortOrder, then name)
  }, [folders, folderSort]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const persistOrder = useCallback(
    (ids: string[]) => {
      fetch('/api/media/dam/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: ids }),
      }).catch((e) => {
        console.error('[FolderTree] reorder failed', e);
        loadFolders();
      });
    },
    [loadFolders],
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setFolders((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === active.id);
      const newIndex = prev.findIndex((f) => f.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      persistOrder(next.map((f) => f.id));
      return next;
    });
  };

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
        onClick={() => go({ folderId: null, view: null, ...SMART_CLEAR })}
        className="rounded-[6px] px-2 py-1.5 text-left transition-colors"
        style={
          allMediaActive
            ? { background: accentBg, color: accent, fontWeight: 500 }
            : { color: 'var(--text-secondary)' }
        }
      >
        All Media
      </button>

      {/* Smart folders — evergreen, fixed (not reorderable) */}
      {SMART.map((s) => {
        const Icon = s.Icon;
        const active = activeSmart === s.key;
        const count = smartCounts[s.countKey];
        return (
          <button
            key={s.key}
            onClick={() => go({ folderId: null, view: null, ...SMART_CLEAR, ...s.params })}
            className="flex items-center gap-2 rounded-[6px] py-1.5 pl-2 pr-2 text-left transition-colors"
            style={{
              background: active ? accentBg : 'transparent',
              color: active ? accent : 'var(--text-secondary)',
              fontWeight: active ? 500 : 400,
            }}
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
            <span className="flex-1 truncate">{s.label}</span>
            {count ? (
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {count}
              </span>
            ) : null}
          </button>
        );
      })}

      {/* Your folders — header + sort control, then the (drag-sortable) list */}
      {folders.length > 0 && (
        <div className="mt-2 flex items-center justify-between px-2 pb-0.5">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Folders
          </span>
          <select
            value={folderSort}
            onChange={(e) => setFolderSort(e.target.value as FolderSort)}
            aria-label="Sort folders"
            className="rounded-[6px] border bg-transparent px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <option value="manual">Manual</option>
            <option value="name">Name</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={displayFolders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {displayFolders.map((f) => (
            <SortableFolderItem
              key={f.id}
              f={f}
              active={activeFolder === f.id}
              count={counts[f.id]}
              accent={accent}
              accentBg={accentBg}
              draggable={folderSort === 'manual'}
              onSelect={() => go({ folderId: f.id, view: null, ...SMART_CLEAR })}
            />
          ))}
        </SortableContext>
      </DndContext>

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
      {/* Saved views section */}
      {saved.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setSavedViewsOpen((v) => !v)}
            className="flex w-full items-center gap-1 rounded-[4px] px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wide focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
            style={{ color: 'var(--text-secondary)' }}
            aria-expanded={savedViewsOpen}
          >
            {savedViewsOpen ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            Saved views
          </button>
          {savedViewsOpen && (
            <nav aria-label="Saved views" className="mt-0.5">
              {saved.map((s) => (
                <div key={s.id} className="group flex items-center gap-1">
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          rename(s.id, renameText.trim() || s.name);
                          setRenamingId(null);
                        } else if (e.key === 'Escape') {
                          setRenamingId(null);
                        }
                      }}
                      onBlur={() => {
                        rename(s.id, renameText.trim() || s.name);
                        setRenamingId(null);
                      }}
                      className="flex-1 rounded-[5px] border px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
                      style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-primary)' }}
                    />
                  ) : (
                    <button
                      onClick={() => {
                        const next = new URLSearchParams(s.params);
                        router.push(`${pathname}?${next.toString()}`);
                        onMobileClose?.();
                      }}
                      className="flex flex-1 items-center gap-2 rounded-[6px] py-1.5 pr-1 text-left text-[13px] transition-colors focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
                      style={{ paddingLeft: 8, color: 'var(--text-secondary)' }}
                    >
                      <Bookmark className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
                      <span className="flex-1 truncate">{s.name}</span>
                    </button>
                  )}
                  <div className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      aria-label={`Options for ${s.name}`}
                      className="rounded-[4px] p-1 focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Toggle a tiny inline action popover via a sibling div trick:
                        // We use dataset attribute to track which is open
                        const btn = e.currentTarget;
                        const popover = btn.nextElementSibling as HTMLElement | null;
                        if (popover) {
                          popover.hidden = !popover.hidden;
                        }
                      }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    <div
                      hidden
                      className="absolute right-0 top-full z-30 mt-0.5 rounded-[6px] p-1"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)', minWidth: 100 }}
                    >
                      <button
                        className="block w-full rounded-[4px] px-2 py-1 text-left text-[12px]"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => {
                          setRenameText(s.name);
                          setRenamingId(s.id);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="block w-full rounded-[4px] px-2 py-1 text-left text-[12px]"
                        style={{ color: 'var(--primary)' }}
                        onClick={() => remove(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </nav>
          )}
        </div>
      )}

      <button
        onClick={() => go({ view: 'trash', folderId: null, ...SMART_CLEAR })}
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

/** A single user folder row. Sortable via a grip handle when `draggable` (Manual
 *  sort mode); the label remains a separate click target so selecting a folder and
 *  dragging it never collide. */
function SortableFolderItem({
  f,
  active,
  count,
  accent,
  accentBg,
  draggable,
  onSelect,
}: {
  f: FolderNode;
  active: boolean;
  count?: number;
  accent: string;
  accentBg: string;
  draggable: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: f.id,
    disabled: !draggable,
  });
  const Icon = TYPE_ICON[f.type] ?? Folder;

  return (
    <div
      ref={setNodeRef}
      className="flex items-center"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      {draggable && (
        <span
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="shrink-0 cursor-grab touch-none pl-1"
          style={{ color: 'var(--text-muted)' }}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] py-1.5 pr-2 text-left transition-colors"
        style={{
          paddingLeft: f.parentId ? 20 : draggable ? 4 : 8,
          background: active ? accentBg : 'transparent',
          color: active ? accent : 'var(--text-secondary)',
          fontWeight: active ? 500 : 400,
        }}
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
        <span className="flex-1 truncate">{f.name}</span>
        {count ? (
          <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            {count}
          </span>
        ) : null}
      </button>
    </div>
  );
}
