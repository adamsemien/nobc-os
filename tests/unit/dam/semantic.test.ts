import { describe, it, expect } from 'vitest';
import {
  vectorLiteral,
  buildSemanticQuery,
  buildSimilarQuery,
  distanceToSimilarity,
} from '@/lib/dam/semantic';

// Pins the structural invariants of the pure SQL builders for DAM semantic search.
//
// These builders produce Prisma.Sql tagged-template objects — never strings — so
// user input can never be interpolated. The tests assert:
//   1. vectorLiteral produces the exact pgvector-compatible format.
//   2. workspaceId is ALWAYS a bound parameter (security boundary, not interpolated).
//   3. deletedAt IS NULL + embedding IS NOT NULL guards are always present.
//   4. Optional filters appear iff provided.
//   5. LIMIT/OFFSET respect the caller's values.
//   6. buildSimilarQuery excludes the source asset id and scopes both the outer
//      query and the subselect to the workspace.
//
// None of these tests execute SQL — Prisma.Sql exposes .sql (the template with ?
// placeholders) and .values (the bound parameters in order).

// ---------------------------------------------------------------------------
// vectorLiteral
// ---------------------------------------------------------------------------

describe('vectorLiteral', () => {
  it('formats a simple positive vector in pgvector canonical form', () => {
    const s = vectorLiteral([0.1, 0.2, 0.3]);
    expect(s).toBe('[0.1,0.2,0.3]');
  });

  it('includes negative values correctly', () => {
    const s = vectorLiteral([-0.5, 1.0]);
    expect(s).toBe('[-0.5,1]');
  });

  it('formats a single-element vector', () => {
    expect(vectorLiteral([0])).toBe('[0]');
  });

  it('returns the bracket-wrapped empty string for an empty array', () => {
    // pgvector toSql([]) → "[]" which is a truthy string, so no throw.
    // The db will reject a 0-dim vector but the builder itself stays safe.
    expect(() => vectorLiteral([])).not.toThrow();
    expect(vectorLiteral([])).toBe('[]');
  });
});

// ---------------------------------------------------------------------------
// buildSemanticQuery — structural / security invariants
// ---------------------------------------------------------------------------

const VEC = [0.1, 0.2, 0.3];
const WS = 'ws-test-123';

describe('buildSemanticQuery', () => {
  it('always scopes to workspaceId as a bound parameter (not interpolated)', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC });
    // workspaceId must appear in .values, not embedded in the SQL template string
    expect(q.values).toContain(WS);
    // And the SQL must reference it as a placeholder
    expect(q.sql).toContain('"workspaceId"');
  });

  it('always includes deletedAt IS NULL guard', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC });
    expect(q.sql).toContain('"deletedAt" IS NULL');
  });

  it('always includes embedding IS NOT NULL guard', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC });
    expect(q.sql).toContain('"embedding" IS NOT NULL');
  });

  it('uses cosine distance operator <=> in ORDER BY', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC });
    expect(q.sql).toContain('<=>');
    expect(q.sql).toContain('ORDER BY');
  });

  it('binds LIMIT and OFFSET values as parameters', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC, limit: 20, offset: 40 });
    expect(q.values).toContain(20);
    expect(q.values).toContain(40);
  });

  it('uses default LIMIT 60 and OFFSET 0 when not specified', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC });
    expect(q.values).toContain(60);
    expect(q.values).toContain(0);
  });

  it('includes distance column when includeDistance is true (default)', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC, includeDistance: true });
    expect(q.sql).toContain('distance');
  });

  it('omits distance column when includeDistance is false', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC, includeDistance: false });
    // Should NOT contain "AS distance" alias
    expect(q.sql).not.toContain('AS distance');
  });

  it('includes fileType as a bound parameter when provided', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC, fileType: 'PHOTO' });
    expect(q.values).toContain('PHOTO');
    // The filter clause casts to "AssetFileType" — presence of the cast text confirms
    // the WHERE clause was emitted (not just the SELECT column list which always has fileType)
    expect(q.sql).toContain('AssetFileType');
  });

  it('omits fileType WHERE clause when not provided', () => {
    // NOTE: "fileType" appears in the static ASSET_COLUMNS SELECT list regardless.
    // We verify the filter was NOT emitted by checking the enum cast is absent.
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC });
    expect(q.sql).not.toContain('AssetFileType');
    // And no 'PHOTO' or 'VIDEO' bound values
    expect(q.values).not.toContain('PHOTO');
    expect(q.values).not.toContain('VIDEO');
  });

  it('includes folderId as a bound parameter when provided', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC, folderId: 'folder-abc' });
    expect(q.values).toContain('folder-abc');
    expect(q.sql).toContain('"folderId"');
  });

  it('omits folderId clause when not provided (no bound folderId value)', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC });
    expect(q.values).not.toContain('folder-abc');
    expect(q.sql).not.toContain('"folderId"');
  });

  it('includes eventId as a bound parameter when provided', () => {
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC, eventId: 'event-xyz' });
    expect(q.values).toContain('event-xyz');
  });

  it('omits eventId WHERE clause when not provided', () => {
    // NOTE: "eventId" appears in the static ASSET_COLUMNS SELECT list regardless.
    // We verify the filter was NOT emitted by checking no eventId-typed value was bound.
    const q = buildSemanticQuery({ workspaceId: WS, queryVec: VEC });
    // The only values should be: workspaceId, limit, offset (no eventId string)
    const nonNumericValues = q.values.filter((v) => typeof v === 'string' && v !== WS);
    expect(nonNumericValues).toHaveLength(0);
  });

  it('can combine multiple filters simultaneously', () => {
    const q = buildSemanticQuery({
      workspaceId: WS,
      queryVec: VEC,
      fileType: 'VIDEO',
      folderId: 'f-1',
      eventId: 'e-1',
    });
    expect(q.values).toContain('VIDEO');
    expect(q.values).toContain('f-1');
    expect(q.values).toContain('e-1');
  });

  it('workspaceId is never embedded as a literal string in the SQL template', () => {
    const sentinel = 'sentinel-workspace-id-99';
    const q = buildSemanticQuery({ workspaceId: sentinel, queryVec: VEC });
    // The raw SQL template strings must not contain the workspaceId value directly
    expect(q.sql).not.toContain(sentinel);
    // But it IS present in the bound values array
    expect(q.values).toContain(sentinel);
  });
});

// ---------------------------------------------------------------------------
// buildSimilarQuery — "more like this" invariants
// ---------------------------------------------------------------------------

const SOURCE_ID = 'asset-source-001';

describe('buildSimilarQuery', () => {
  it('scopes to workspaceId as a bound parameter', () => {
    const q = buildSimilarQuery({ workspaceId: WS, sourceAssetId: SOURCE_ID });
    expect(q.values).toContain(WS);
    expect(q.sql).toContain('"workspaceId"');
  });

  it('always includes deletedAt IS NULL and embedding IS NOT NULL', () => {
    const q = buildSimilarQuery({ workspaceId: WS, sourceAssetId: SOURCE_ID });
    expect(q.sql).toContain('"deletedAt" IS NULL');
    expect(q.sql).toContain('"embedding" IS NOT NULL');
  });

  it('excludes the source asset via id != as a bound parameter', () => {
    const q = buildSimilarQuery({ workspaceId: WS, sourceAssetId: SOURCE_ID });
    // The source id must appear in .values (not interpolated)
    expect(q.values).toContain(SOURCE_ID);
    // SQL must have an exclusion clause
    expect(q.sql).toMatch(/"id"\s*!=\s*\?/);
  });

  it('scopes the subselect to workspaceId (both outer and inner)', () => {
    const q = buildSimilarQuery({ workspaceId: WS, sourceAssetId: SOURCE_ID });
    // workspaceId appears in both outer WHERE and subselect WHERE — so it should
    // appear at least twice in the values array
    const wsOccurrences = q.values.filter((v) => v === WS);
    expect(wsOccurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('uses cosine distance <=> for ordering', () => {
    const q = buildSimilarQuery({ workspaceId: WS, sourceAssetId: SOURCE_ID });
    expect(q.sql).toContain('<=>');
    expect(q.sql).toContain('ORDER BY');
  });

  it('uses default LIMIT 24 when not specified', () => {
    const q = buildSimilarQuery({ workspaceId: WS, sourceAssetId: SOURCE_ID });
    expect(q.values).toContain(24);
  });

  it('respects a custom limit', () => {
    const q = buildSimilarQuery({ workspaceId: WS, sourceAssetId: SOURCE_ID, limit: 8 });
    expect(q.values).toContain(8);
  });
});

// ---------------------------------------------------------------------------
// distanceToSimilarity
// ---------------------------------------------------------------------------

describe('distanceToSimilarity', () => {
  it('converts distance 0 → similarity 1 (identical vectors)', () => {
    expect(distanceToSimilarity(0)).toBe(1);
  });

  it('converts distance 1 → similarity 0 (orthogonal vectors)', () => {
    expect(distanceToSimilarity(1)).toBe(0);
  });

  it('converts distance 0.5 → similarity 0.5', () => {
    expect(distanceToSimilarity(0.5)).toBeCloseTo(0.5);
  });

  it('allows similarity > 1 for distances below 0 (cosine can be negative)', () => {
    // Cosine distance can theoretically be < 0 for anti-correlated vectors.
    // The impl is 1 - distance, so similarity > 1 is expected, not clamped.
    expect(distanceToSimilarity(-0.2)).toBeCloseTo(1.2);
  });
});
