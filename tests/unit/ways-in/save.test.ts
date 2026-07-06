import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { GateEngine } from '@/lib/gate-engine/orchestrate';
import type { GateTreeNode } from '@/lib/gate-engine/types';
import { hashGateTree } from '@/lib/ways-in/advanced';
import { mapCompiledTree, saveWaysIn } from '@/lib/ways-in/save';
import type { WaysInList } from '@/lib/ways-in/schema';

const LIST: WaysInList = [
  {
    id: 'w-general',
    label: 'General',
    who: 'anyone',
    requirements: [{ type: 'pay' }],
    priceCents: 2600,
    approval: 'instant',
    visibility: 'public',
  },
];

function storedTree(): GateTreeNode {
  return {
    id: 'root-db',
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
        id: 'grp-db',
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
            id: 'cond-db',
            kind: 'CONDITION',
            required: false,
            weight: null,
            rule: null,
            requiredCount: null,
            weightThreshold: null,
            conditionType: 'PAY',
            config: { priceCents: 2600, currency: 'usd', label: 'General' },
            children: [],
          },
        ],
      },
    ],
  };
}

function fakeDeps(opts: {
  eventInWorkspace?: boolean;
  priorMap?: unknown;
  existingGate?: { gateId: string } | null;
  storedAfterWrite?: GateTreeNode | null;
}) {
  const upsert = vi.fn().mockResolvedValue({ id: 'row1' });
  const db = {
    event: {
      findFirst: vi.fn().mockResolvedValue(opts.eventInWorkspace === false ? null : { id: 'ev1' }),
    },
    eventAccessModel: {
      findFirst: vi.fn().mockResolvedValue(
        opts.priorMap === undefined ? null : { compiledMap: opts.priorMap },
      ),
      upsert,
    },
  } as unknown as PrismaClient;

  const getGateForResource = vi.fn();
  getGateForResource
    .mockResolvedValueOnce(
      opts.existingGate ? { gateId: opts.existingGate.gateId, name: null, tree: storedTree() } : null,
    )
    .mockResolvedValueOnce(
      opts.storedAfterWrite === null
        ? { gateId: 'g1', name: null, tree: null }
        : { gateId: 'g1', name: null, tree: opts.storedAfterWrite ?? storedTree() },
    );
  const engine = {
    getGateForResource,
    createGate: vi.fn().mockResolvedValue({ gateId: 'g-new', rootNodeId: 'root-db' }),
    updateGate: vi.fn().mockResolvedValue({ rootNodeId: 'root-db' }),
  } as unknown as GateEngine;

  return { db, engine, upsert, getGateForResource };
}

const ARGS = { workspaceId: 'w1', eventId: 'ev1', waysIn: LIST };

describe('saveWaysIn — compile-on-save', () => {
  it('creates the gate when none exists and persists the document + bookkeeping', async () => {
    const { db, engine, upsert } = fakeDeps({ existingGate: null });
    const result = await saveWaysIn({ db, engine }, ARGS);

    expect(engine.createGate).toHaveBeenCalledOnce();
    expect(engine.updateGate).not.toHaveBeenCalled();
    expect(result.gateId).toBe('g-new');
    expect(result.compiledTreeHash).toBe(hashGateTree(storedTree()));
    expect(result.compiledMap).toEqual({
      rootNodeId: 'root-db',
      wayIns: { 'w-general': { groupNodeId: 'grp-db', conditionNodeIds: ['cond-db'] } },
    });
    expect(upsert).toHaveBeenCalledOnce();
    const upsertArg = upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ eventId: 'ev1' });
    expect(upsertArg.create.compiledTreeHash).toBe(result.compiledTreeHash);
    expect(upsertArg.create.waysIn).toEqual(LIST);
  });

  it('updates the existing gate and feeds prior node ids into the spec (proofs survive)', async () => {
    const prior = {
      rootNodeId: 'root-db',
      wayIns: { 'w-general': { groupNodeId: 'grp-db', conditionNodeIds: ['cond-db'] } },
    };
    const { db, engine } = fakeDeps({ existingGate: { gateId: 'g1' }, priorMap: prior });
    const result = await saveWaysIn({ db, engine }, ARGS);

    expect(engine.createGate).not.toHaveBeenCalled();
    expect(engine.updateGate).toHaveBeenCalledOnce();
    const spec = (engine.updateGate as ReturnType<typeof vi.fn>).mock.calls[0][0].spec;
    expect(spec.id).toBe('root-db');
    expect(spec.children[0].id).toBe('grp-db');
    expect(spec.children[0].children[0].id).toBe('cond-db');
    expect(result.gateId).toBe('g1');
  });

  it('refuses an event outside the workspace before any write', async () => {
    const { db, engine, upsert } = fakeDeps({ eventInWorkspace: false });
    await expect(saveWaysIn({ db, engine }, ARGS)).rejects.toThrow(/not found in workspace/);
    expect(engine.createGate).not.toHaveBeenCalled();
    expect(engine.updateGate).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('throws (and does not persist) when the stored tree re-loads malformed', async () => {
    const { db, engine, upsert } = fakeDeps({ existingGate: null, storedAfterWrite: null });
    await expect(saveWaysIn({ db, engine }, ARGS)).rejects.toThrow(/malformed/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('mapCompiledTree', () => {
  it('maps by position: list order = root children order, requirement order = condition order', () => {
    const map = mapCompiledTree(LIST, storedTree());
    expect(map).toEqual({
      rootNodeId: 'root-db',
      wayIns: { 'w-general': { groupNodeId: 'grp-db', conditionNodeIds: ['cond-db'] } },
    });
  });
});
