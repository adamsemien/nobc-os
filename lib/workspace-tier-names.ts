import { db } from './db';
import { resolveTierNames, DEFAULT_TIER_NAMES, type TierNames } from './score-display';

/** Fetch the workspace-configured tier names. Falls back to defaults if unset
 *  or workspaceId is invalid. */
export async function getWorkspaceTierNames(workspaceId: string): Promise<TierNames> {
  const w = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { tierNames: true },
  });
  return resolveTierNames(w?.tierNames);
}

export { DEFAULT_TIER_NAMES };
export type { TierNames };
