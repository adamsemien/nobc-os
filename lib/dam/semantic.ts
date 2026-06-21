/**
 * lib/dam/semantic.ts — pure vector SQL helpers for DAM semantic search.
 *
 * All functions are pure (no DB calls, no I/O) so they can be unit-tested
 * without a live database. The route handlers own execution.
 *
 * Vector similarity uses cosine distance (<=>), ordered ASC (closest first).
 * No absolute threshold — CLIP absolute cosines are small (~0.15 for strong
 * matches), so a cutoff would empty good results. Rank by distance only.
 */

import { Prisma } from '@prisma/client';
import { toSql } from 'pgvector';

/** The columns returned by every asset list query (matches the grid route exactly). */
const ASSET_COLUMNS = Prisma.sql`
  "id", "filename", "blurhash", "width", "height", "fileType", "isSelect",
  "shootDate", "sponsorName", "eventId", "tags", "aiTags", "qualityScore",
  "createdAt", "size", "shooterCredit"`;

/**
 * Format a JS number[] as a pgvector literal string, e.g. `[0.1,0.2,...]`.
 *
 * Uses the pgvector package's `toSql` helper (same as scripts/migrate-canto.ts)
 * which produces the canonical `[n,n,n,...]` text representation.
 */
export function vectorLiteral(vec: number[]): string {
  const s = toSql(vec);
  if (!s) throw new Error('[dam/semantic] vectorLiteral: toSql returned null for non-empty array');
  return s;
}

export interface SemanticQueryOpts {
  workspaceId: string;
  queryVec: number[]; // 768-d CLIP vector
  limit?: number;     // default 60
  offset?: number;    // default 0
  // Optional filters (same surface area as the grid route)
  fileType?: 'PHOTO' | 'VIDEO';
  folderId?: string;
  eventId?: string;
  // Include the distance column in SELECT? Useful for debugging (default true).
  includeDistance?: boolean;
}

/**
 * Build the full $queryRaw SQL for semantic (vector-distance) asset search.
 *
 * Returns a Prisma.Sql tagged-template value ready for `db.$queryRaw(...)`.
 * The query vector is cast to `::vector` by Postgres. workspaceId and all
 * filter values are parameterized — no user-string interpolation.
 *
 * Columns returned: same as the grid route, plus optionally `distance`.
 */
export function buildSemanticQuery(opts: SemanticQueryOpts): Prisma.Sql {
  const {
    workspaceId,
    queryVec,
    limit = 60,
    offset = 0,
    fileType,
    folderId,
    eventId,
    includeDistance = true,
  } = opts;

  const vecLiteral = vectorLiteral(queryVec);
  // Prisma.raw is safe here: vecLiteral is server-derived from a numeric float array,
  // never from user input. The format is strictly `[n,n,...]` from pgvector's toSql.
  const vecSql = Prisma.raw(`'${vecLiteral}'::vector`);

  const distanceCol = includeDistance
    ? Prisma.sql`, (embedding <=> ${vecSql}) AS distance`
    : Prisma.empty;

  // Build optional filter clauses.
  const filterClauses: Prisma.Sql[] = [];
  if (fileType) filterClauses.push(Prisma.sql`AND "fileType" = ${fileType}::"AssetFileType"`);
  if (folderId) filterClauses.push(Prisma.sql`AND "folderId" = ${folderId}`);
  if (eventId) filterClauses.push(Prisma.sql`AND "eventId" = ${eventId}`);
  const filters =
    filterClauses.length > 0
      ? Prisma.join(filterClauses, ' ')
      : Prisma.empty;

  return Prisma.sql`
    SELECT ${ASSET_COLUMNS}${distanceCol}
    FROM "Asset"
    WHERE "workspaceId" = ${workspaceId}
      AND "deletedAt" IS NULL
      AND "embedding" IS NOT NULL
      ${filters}
    ORDER BY embedding <=> ${vecSql} ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/**
 * Build the SQL for "more like this" — nearest neighbors to a stored asset's
 * embedding, using a subselect so the 768 floats never round-trip through JS.
 *
 * Excludes the source asset. Both the outer query and the subselect are
 * workspace-scoped.
 */
export interface SimilarQueryOpts {
  workspaceId: string;
  sourceAssetId: string;
  limit?: number; // default 24
}

export function buildSimilarQuery(opts: SimilarQueryOpts): Prisma.Sql {
  const { workspaceId, sourceAssetId, limit = 24 } = opts;

  return Prisma.sql`
    SELECT ${ASSET_COLUMNS}
    FROM "Asset"
    WHERE "workspaceId" = ${workspaceId}
      AND "deletedAt" IS NULL
      AND "embedding" IS NOT NULL
      AND "id" != ${sourceAssetId}
    ORDER BY embedding <=> (
      SELECT embedding FROM "Asset"
      WHERE "id" = ${sourceAssetId}
        AND "workspaceId" = ${workspaceId}
    ) ASC
    LIMIT ${limit}
  `;
}

/** Convert cosine distance to similarity score (informational only — ranking uses distance). */
export function distanceToSimilarity(distance: number): number {
  return 1 - distance;
}
