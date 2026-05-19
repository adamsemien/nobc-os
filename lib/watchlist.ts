import { db } from './db';

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().+]/g, '').replace(/^1(\d{10})$/, '$1');
}

function normalizeInstagram(handle: string): string {
  return handle.replace(/^@/, '').toLowerCase().trim();
}

export type WatchListMatch = {
  type: 'PURPLE' | 'BLOCKED';
  entryId: string;
  note: string | null;
};

/** Check WatchList. BLOCKED takes priority over PURPLE. Returns first match or null. */
export async function checkWatchList(
  workspaceId: string,
  email: string,
  phone: string | null,
  instagram: string | null,
): Promise<WatchListMatch | null> {
  const entries = await db.watchList.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, type: true, note: true, matchEmail: true, matchPhone: true, matchInstagram: true },
  });

  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const normalizedIg = instagram ? normalizeInstagram(instagram) : null;

  function matches(entry: typeof entries[number]): boolean {
    if (entry.matchEmail && entry.matchEmail.toLowerCase() === email.toLowerCase()) return true;
    if (entry.matchPhone && normalizedPhone && normalizePhone(entry.matchPhone) === normalizedPhone) return true;
    if (entry.matchInstagram && normalizedIg && normalizeInstagram(entry.matchInstagram) === normalizedIg) return true;
    return false;
  }

  type Entry = typeof entries[number];

  // BLOCKED takes priority
  const blocked = entries.find((e: Entry) => e.type === 'BLOCKED' && matches(e));
  if (blocked) return { type: 'BLOCKED', entryId: blocked.id, note: blocked.note };

  const purple = entries.find((e: Entry) => e.type === 'PURPLE' && matches(e));
  if (purple) return { type: 'PURPLE', entryId: purple.id, note: purple.note };

  return null;
}

/** Check for duplicate application in same workspace (different application ID). */
export async function checkDuplicate(
  workspaceId: string,
  email: string,
  phone: string | null,
  excludeId: string,
): Promise<boolean> {
  const byEmail = await db.application.findFirst({
    where: { workspaceId, email: { equals: email, mode: 'insensitive' }, id: { not: excludeId } },
    select: { id: true },
  });
  if (byEmail) return true;

  if (phone) {
    const normalized = normalizePhone(phone);
    const apps = await db.application.findMany({
      where: { workspaceId, phone: { not: null }, id: { not: excludeId } },
      select: { phone: true },
    });
    if (apps.some(a => a.phone && normalizePhone(a.phone) === normalized)) return true;
  }

  return false;
}
