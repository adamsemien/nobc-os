import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getAdvancedGateStatus, hashGateTree } from '@/lib/ways-in/advanced';
import type { GateTreeNode } from '@/lib/gate-engine/types';

function tree(overrides?: Partial<GateTreeNode>): GateTreeNode {
  return {
    id: 'root',
    kind: 'GROUP',
    required: false,
    weight: null,
    rule: 'ANY_N',
    requiredCount: 1,
    weightThreshold: null,
    conditionType: null,
    config: null,
    children: [
      {
        id: 'grp',
        kind: 'GROUP',
        required: false,
        weight: null,
        rule: 'ALL',
        requiredCount: null,
        weightThreshold: null,
        conditionType: null,
        config: null,
        children: [
          {
            id: 'cond',
            kind: 'CONDITION',
            required: false,
            weight: null,
            rule: null,
            requiredCount: null,
            weightThreshold: null,
            conditionType: 'PAY',
            config: { priceCents: 2600, currency: 'usd' },
            children: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('hashGateTree — semantic hash', () => {
  it('is stable across node-id changes (ids are not semantics)', () => {
    const a = tree();
    const b = tree({ id: 'different-root' });
    b.children[0].id = 'different-grp';
    b.children[0].children[0].id = 'different-cond';
    expect(hashGateTree(a)).toBe(hashGateTree(b));
  });

  it('changes when a condition config changes', () => {
    const a = tree();
    const b = tree();
    b.children[0].children[0].config = { priceCents: 9900, currency: 'usd' };
    expect(hashGateTree(a)).not.toBe(hashGateTree(b));
  });

  it('changes when the group rule changes', () => {
    const a = tree();
    const b = tree({ rule: 'ALL', requiredCount: null });
    expect(hashGateTree(a)).not.toBe(hashGateTree(b));
  });

  it('is insensitive to config key order', () => {
    const a = tree();
    const b = tree();
    b.children[0].children[0].config = { currency: 'usd', priceCents: 2600 };
    expect(hashGateTree(a)).toBe(hashGateTree(b));
  });
});

/** Row-shaped fake matching what getGateForResource reads. */
function gateRows(configOverride?: Record<string, unknown>) {
  return [
    { id: 'root', parentId: null, position: 0, kind: 'GROUP', required: false, weight: null, rule: 'ANY_N', requiredCount: 1, weightThreshold: null, conditionType: null, config: null },
    { id: 'grp', parentId: 'root', position: 0, kind: 'GROUP', required: false, weight: null, rule: 'ALL', requiredCount: null, weightThreshold: null, conditionType: null, config: null },
    { id: 'cond', parentId: 'grp', position: 0, kind: 'CONDITION', required: false, weight: null, rule: null, requiredCount: null, weightThreshold: null, conditionType: 'PAY', config: configOverride ?? { priceCents: 2600, currency: 'usd' } },
  ];
}

function fakeDb(opts: {
  modelHash: string | null | undefined; // undefined = no row at all
  gateExists: boolean;
  rows?: ReturnType<typeof gateRows>;
}): PrismaClient {
  return {
    eventAccessModel: {
      findFirst: async () =>
        opts.modelHash === undefined ? null : { compiledTreeHash: opts.modelHash },
    },
    gate: {
      findFirst: async () => (opts.gateExists ? { id: 'g1', name: null } : null),
    },
    gateNode: {
      findMany: async () => opts.rows ?? gateRows(),
    },
  } as unknown as PrismaClient;
}

const ARGS = { workspaceId: 'w1', eventId: 'ev1' };

describe('getAdvancedGateStatus', () => {
  it('no gate + no model -> not advanced (NOT_COMPILED)', async () => {
    const status = await getAdvancedGateStatus(fakeDb({ modelHash: undefined, gateExists: false }), ARGS);
    expect(status).toEqual({ advanced: false, reason: 'NOT_COMPILED' });
  });

  it('no gate but the model compiled once -> advanced (GATE_MISSING)', async () => {
    const status = await getAdvancedGateStatus(fakeDb({ modelHash: 'abc', gateExists: false }), ARGS);
    expect(status).toEqual({ advanced: true, reason: 'GATE_MISSING' });
  });

  it('gate with no Ways-In document -> advanced (NO_MODEL, hand-authored)', async () => {
    const status = await getAdvancedGateStatus(fakeDb({ modelHash: undefined, gateExists: true }), ARGS);
    expect(status).toEqual({ advanced: true, reason: 'NO_MODEL' });
  });

  it('tree hash matches the stored compile -> not advanced', async () => {
    const db = fakeDb({ modelHash: '', gateExists: true });
    // Compute the true hash of the fake rows through the real loader path.
    const probe = await getAdvancedGateStatus(db, ARGS); // hash mismatch on '' -> HAND_EDITED
    expect(probe.advanced).toBe(true);
    // Now feed the real hash back in - it must read as compiled.
    const { getGateForResource } = await import('@/lib/gate-engine/authoring');
    const loaded = await getGateForResource(db, {
      workspaceId: 'w1',
      resource: { type: 'EVENT', id: 'ev1' },
    });
    const trueHash = hashGateTree(loaded!.tree!);
    const status = await getAdvancedGateStatus(fakeDb({ modelHash: trueHash, gateExists: true }), ARGS);
    expect(status).toEqual({ advanced: false, reason: 'MATCHES_COMPILE' });
  });

  it('a hand-edited tree (config changed) -> advanced (HAND_EDITED)', async () => {
    const { getGateForResource } = await import('@/lib/gate-engine/authoring');
    const original = fakeDb({ modelHash: null, gateExists: true });
    const loaded = await getGateForResource(original, {
      workspaceId: 'w1',
      resource: { type: 'EVENT', id: 'ev1' },
    });
    const compiledHash = hashGateTree(loaded!.tree!);
    // Same gate, but someone raised the price by hand in GateBuilderTab.
    const edited = fakeDb({
      modelHash: compiledHash,
      gateExists: true,
      rows: gateRows({ priceCents: 9900, currency: 'usd' }),
    });
    const status = await getAdvancedGateStatus(edited, ARGS);
    expect(status).toEqual({ advanced: true, reason: 'HAND_EDITED' });
  });

  it('a malformed stored tree (two roots) fails closed to advanced', async () => {
    const rows = gateRows();
    rows.push({ ...rows[0], id: 'root-2' });
    const status = await getAdvancedGateStatus(
      fakeDb({ modelHash: 'abc', gateExists: true, rows }),
      ARGS,
    );
    expect(status).toEqual({ advanced: true, reason: 'GATE_MISSING' });
  });
});
