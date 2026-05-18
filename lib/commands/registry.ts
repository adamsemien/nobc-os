/** Command Registry — the catalog the Cmd+K palette reads from.
 *
 *  registerCommand() is called by each command file at import time.
 *  listCommands() returns commands filtered + fuzzy-ranked against a query.
 *  Fuzzy ranking is hand-rolled (~40 lines) — no cmdk, fuse.js, or kbar. */
import type { Command, CommandContext, CommandGroup } from './types';

const REGISTRY = new Map<string, Command>();

/** Registers a command. Idempotent — last write wins, supports dev HMR. */
export function registerCommand(cmd: Command): void {
  REGISTRY.set(cmd.id, cmd);
}

export function getCommand(id: string): Command | undefined {
  return REGISTRY.get(id);
}

export interface ListFilter {
  group?: CommandGroup;
  query?: string;
}

/** Scores a command against a query. Returns null when any token misses.
 *  Higher is better: field weight, earlier match, word-boundary bonus. */
function scoreCommand(cmd: Command, query: string): number | null {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  const fields: { text: string; weight: number }[] = [
    { text: cmd.name.toLowerCase(), weight: 4 },
    { text: (cmd.keywords ?? []).join(' ').toLowerCase(), weight: 3 },
    { text: (cmd.description ?? '').toLowerCase(), weight: 1 },
  ];

  let total = 0;
  for (const token of tokens) {
    let best: number | null = null;
    for (const f of fields) {
      const idx = f.text.indexOf(token);
      if (idx === -1) continue;
      const atBoundary = idx === 0 || /\s/.test(f.text[idx - 1] ?? '');
      const score = f.weight * 12 - Math.min(idx, 11) + (atBoundary ? 6 : 0);
      if (best === null || score > best) best = score;
    }
    if (best === null) return null; // every token must hit some field
    total += best;
  }
  return total;
}

/** Returns commands. Empty query → all, sorted by group then name.
 *  Typed query → flat list, fuzzy-ranked best-first. */
export function listCommands(filter: ListFilter = {}): Command[] {
  let all = [...REGISTRY.values()];
  if (filter.group) all = all.filter((c) => c.group === filter.group);

  const query = filter.query?.trim() ?? '';
  if (!query) {
    return all.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }

  return all
    .map((c) => ({ command: c, score: scoreCommand(c, query) }))
    .filter((x): x is { command: Command; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
    .map((x) => x.command);
}

/** Filters + fuzzy-ranks an arbitrary command list against a query.
 *  Empty query returns the list unchanged. The palette uses this to rank the
 *  merged static + dynamic (event) command pool with the same algorithm. */
export function rankCommands(commands: Command[], query: string): Command[] {
  const q = query.trim();
  if (!q) return commands;
  return commands
    .map((command) => ({ command, score: scoreCommand(command, q) }))
    .filter((x): x is { command: Command; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
    .map((x) => x.command);
}

/** Runs a command by id. Throws if unknown — the palette catches and toasts. */
export async function executeCommand(id: string, ctx: CommandContext): Promise<void> {
  const cmd = REGISTRY.get(id);
  if (!cmd) throw new Error(`Unknown command: ${id}`);
  await cmd.execute(ctx);
}
