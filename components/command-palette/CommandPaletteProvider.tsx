'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CommandPalette } from './CommandPalette';
import type { EventLite } from '@/lib/commands/event-commands';
import '@/lib/commands'; // side effect: registers every command

interface PaletteApi {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const PaletteContext = createContext<PaletteApi | null>(null);

export function useCommandPalette(): PaletteApi {
  const value = useContext(PaletteContext);
  if (!value) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return value;
}

/** Mounts the Cmd+K palette and owns its open state. Wraps the operator
 *  layout so the trigger pill and any future surface can open it. */
export function CommandPaletteProvider({
  workspaceId,
  events,
  children,
}: {
  workspaceId: string;
  events: EventLite[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openPalette = useCallback(() => {
    const el = typeof document !== 'undefined' ? document.activeElement : null;
    triggerRef.current = el instanceof HTMLElement ? el : null;
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    // Restore focus to whatever opened the palette.
    const trigger = triggerRef.current;
    if (trigger && document.contains(trigger)) {
      requestAnimationFrame(() => trigger.focus());
    }
  }, []);

  // Global ⌘K / Ctrl+K (and the ⌘. designer alias) opens the palette.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const isDot = e.metaKey && e.key === '.';
      if (!isK && !isDot) return;

      // Already open: swallow the keystroke, leave the palette as-is.
      if (open) {
        e.preventDefault();
        return;
      }

      // Don't hijack ⌘K while an operator is typing in a field.
      const el = document.activeElement;
      const editable = el instanceof HTMLElement && el.isContentEditable;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;

      e.preventDefault();
      openPalette();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, openPalette]);

  return (
    <PaletteContext.Provider value={{ open, openPalette, closePalette }}>
      {children}
      <CommandPalette
        open={open}
        workspaceId={workspaceId}
        events={events}
        onClose={closePalette}
      />
    </PaletteContext.Provider>
  );
}
