import { Prisma } from '@prisma/client';

export type AssetSort =
  | 'date'
  | 'event'
  | 'sponsor'
  | 'fileType'
  | 'selects'
  | 'quality'
  | 'manual';
export type AssetView = 'active' | 'trash';

export interface AssetQuery {
  sort: AssetSort;
  view: AssetView;
  eventId?: string;
  folderId?: string;
  fileType?: 'PHOTO' | 'VIDEO';
  isSelect?: boolean;
  sponsor?: string;
  tag?: string;
  q?: string;
  from?: string; // ISO date
  to?: string; // ISO date
  minQuality?: number; // Top Picks filter — qualityScore >=
  recent?: boolean; // Recent smart folder — added within the last 30 days
  cursor?: string;
}

const SORTS: Record<AssetSort, Prisma.Sql> = {
  date: Prisma.sql`"shootDate" DESC NULLS LAST, "createdAt" DESC`,
  event: Prisma.sql`"eventId" ASC NULLS LAST, "createdAt" DESC`,
  sponsor: Prisma.sql`"sponsorName" ASC NULLS LAST, "createdAt" DESC`,
  fileType: Prisma.sql`"fileType" ASC, "createdAt" DESC`,
  selects: Prisma.sql`"isSelect" DESC, "createdAt" DESC`,
  quality: Prisma.sql`"qualityScore" DESC NULLS LAST, "createdAt" DESC`,
  manual: Prisma.sql`"sortOrder" ASC, "createdAt" DESC`,
};
export const ASSET_SORTS = SORTS;

export function parseAssetQuery(sp: URLSearchParams): AssetQuery {
  const rawSort = sp.get('sort') ?? 'date';
  const sort = (Object.keys(SORTS) as AssetSort[]).includes(rawSort as AssetSort)
    ? (rawSort as AssetSort)
    : 'date';
  const view: AssetView = sp.get('view') === 'trash' ? 'trash' : 'active';
  const ft = sp.get('fileType');
  const mq = sp.get('minQuality');
  const minQuality = mq && Number.isFinite(Number(mq)) ? Number(mq) : undefined;
  return {
    sort,
    view,
    eventId: sp.get('eventId') || undefined,
    folderId: sp.get('folderId') || undefined,
    fileType: ft === 'PHOTO' || ft === 'VIDEO' ? ft : undefined,
    isSelect: sp.get('isSelect') === 'true' ? true : undefined,
    sponsor: sp.get('sponsor') || undefined,
    tag: sp.get('tag') || undefined,
    q: sp.get('q')?.trim() || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    minQuality,
    recent: sp.get('recent') === '1' || sp.get('recent') === 'true' ? true : undefined,
    cursor: sp.get('cursor') || undefined,
  };
}

/**
 * Build the WHERE fragment (workspace-scoped). Caller passes the workspaceId and,
 * when `q` is present, the ids of events whose title matches `q` (event titles are
 * not in the asset search vector because `eventId` is a plain string, not a relation).
 */
export function buildAssetWhere(
  workspaceId: string,
  p: AssetQuery,
  matchingEventIds: string[],
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`"workspaceId" = ${workspaceId}`];
  clauses.push(
    p.view === 'trash'
      ? Prisma.sql`"deletedAt" IS NOT NULL`
      : Prisma.sql`"deletedAt" IS NULL`,
  );
  if (p.eventId) clauses.push(Prisma.sql`"eventId" = ${p.eventId}`);
  if (p.folderId) clauses.push(Prisma.sql`"folderId" = ${p.folderId}`);
  if (p.fileType) clauses.push(Prisma.sql`"fileType" = ${p.fileType}::"AssetFileType"`);
  if (p.isSelect) clauses.push(Prisma.sql`"isSelect" = true`);
  if (p.sponsor) clauses.push(Prisma.sql`"sponsorName" = ${p.sponsor}`);
  if (p.tag) clauses.push(Prisma.sql`(${p.tag} = ANY("tags") OR ${p.tag} = ANY("aiTags"))`);
  if (p.from) clauses.push(Prisma.sql`"shootDate" >= ${new Date(p.from)}`);
  if (p.to) clauses.push(Prisma.sql`"shootDate" <= ${new Date(p.to)}`);
  if (p.minQuality != null) clauses.push(Prisma.sql`"qualityScore" >= ${p.minQuality}`);
  if (p.recent) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    clauses.push(Prisma.sql`"createdAt" >= ${since}`);
  }
  if (p.q) {
    const eventMatch = matchingEventIds.length
      ? Prisma.sql`OR "eventId" IN (${Prisma.join(matchingEventIds)})`
      : Prisma.empty;
    clauses.push(
      Prisma.sql`("searchVector" @@ websearch_to_tsquery('simple', ${p.q}) ${eventMatch})`,
    );
  }
  return Prisma.join(clauses, ' AND ');
}
