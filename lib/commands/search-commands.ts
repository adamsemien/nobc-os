import { Inbox, User, Calendar } from 'lucide-react';
import type { Command } from './types';

export type SearchHit = {
  type: 'member' | 'application' | 'event';
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
};

/** Convert search-API hits into dynamic Commands the palette can render. */
export function buildSearchCommands(hits: SearchHit[]): Command[] {
  return hits.map((h) => {
    const icon =
      h.type === 'application'
        ? Inbox
        : h.type === 'event'
          ? Calendar
          : User;
    return {
      id: `search.${h.type}.${h.id}`,
      name: h.label,
      description: h.sublabel ?? undefined,
      keywords: [h.type, h.label],
      group: h.type === 'application' ? 'event' : 'navigation',
      icon,
      execute: (ctx) => {
        ctx.router.push(h.href);
        ctx.closeCommandPalette();
      },
    };
  });
}
