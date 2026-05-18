/** Command Registry — type system.
 *
 *  Mirrors the metric registry pattern. Every command is one file in
 *  lib/commands/{group}/{slug}.ts that calls registerCommand() at import time.
 *  The Cmd+K palette, and later the Task 2 AI agent, are just consumers. */
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { LucideIcon } from 'lucide-react';
import type { ThemeId } from '@/lib/theme';

export type CommandGroup = 'theme' | 'navigation' | 'event' | 'action' | 'agent';

export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  theme: 'Theme',
  navigation: 'Navigation',
  event: 'Events',
  action: 'Actions',
  agent: 'Agent',
};

/** Display order for grouped (empty-query) rendering. */
export const COMMAND_GROUP_ORDER: CommandGroup[] = [
  'theme',
  'navigation',
  'event',
  'action',
  'agent',
];

export interface CommandContext {
  /** Carried for Task 2 agent commands — not used by theme/navigation commands. */
  workspaceId: string;
  /** next/navigation router — drives navigation commands. */
  router: AppRouterInstance;
  setTheme: (theme: ThemeId) => void;
  closeCommandPalette: () => void;
  // future: agentClient for Task 2
}

export interface Command {
  /** Dotted id, e.g. 'theme.switch-midnight'. */
  id: string;
  /** Shown as the result row title. */
  name: string;
  /** Shown under the name, optional. */
  description?: string;
  /** Fuzzy-search fodder, e.g. ['dark', 'night']. */
  keywords?: string[];
  group: CommandGroup;
  icon?: LucideIcon;
  /** Display only — e.g. '⌘1'. Not bound to a key. */
  shortcut?: string;
  /** Right-aligned faint secondary text — e.g. a past-event date stamp. */
  trailing?: string;
  execute: (ctx: CommandContext) => void | Promise<void>;
  /** Optional visibility filter — evaluated by the palette with live context. */
  visible?: (ctx: CommandContext) => boolean;
}
