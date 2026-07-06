import { describe, it, expect } from 'vitest';
import { deriveSatisfiedWayIn } from '@/lib/ways-in/derive';
import type { CompiledMap, WaysInList } from '@/lib/ways-in/schema';
import type { GateEvaluation } from '@/lib/gate-engine/types';

const LIST: WaysInList = [
  {
    id: 'w-member',
    label: 'Member',
    who: 'members',
    requirements: [{ type: 'nothing' }],
    approval: 'instant',
    visibility: 'public',
  },
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

const MAP: CompiledMap = {
  rootNodeId: 'root',
  wayIns: {
    'w-member': { groupNodeId: 'grp-member', conditionNodeIds: ['c-open'] },
    'w-general': { groupNodeId: 'grp-general', conditionNodeIds: ['c-pay'] },
  },
};

function evaluation(satisfiedIds: string[]): GateEvaluation {
  const all = ['root', 'grp-member', 'c-open', 'grp-general', 'c-pay'];
  return {
    open: satisfiedIds.includes('root'),
    structuralViolation: false,
    nodes: all.map((nodeId) => ({
      nodeId,
      satisfied: satisfiedIds.includes(nodeId),
      reason: satisfiedIds.includes(nodeId) ? 'GROUP_SATISFIED' : 'RULE_UNMET',
    })),
  };
}

describe('deriveSatisfiedWayIn (spec §2.4)', () => {
  it('names the paid Way In and its price when the PAY path satisfied', () => {
    const result = deriveSatisfiedWayIn(LIST, MAP, evaluation(['root', 'grp-general', 'c-pay']));
    expect(result.winner).toEqual({ wayInId: 'w-general', label: 'General', priceCents: 2600 });
    expect(result.satisfied).toHaveLength(1);
  });

  it('list order is priority: first satisfied Way In wins a tie', () => {
    const result = deriveSatisfiedWayIn(
      LIST,
      MAP,
      evaluation(['root', 'grp-member', 'c-open', 'grp-general', 'c-pay']),
    );
    expect(result.winner?.wayInId).toBe('w-member');
    expect(result.winner?.priceCents).toBeNull();
    expect(result.satisfied.map((s) => s.wayInId)).toEqual(['w-member', 'w-general']);
  });

  it('returns null winner when no Way-In group satisfied', () => {
    const result = deriveSatisfiedWayIn(LIST, MAP, evaluation([]));
    expect(result.winner).toBeNull();
    expect(result.satisfied).toEqual([]);
  });

  it('skips a Way In missing from the compiled map (advanced/stale gates)', () => {
    const partialMap: CompiledMap = {
      rootNodeId: 'root',
      wayIns: { 'w-general': MAP.wayIns['w-general'] },
    };
    const result = deriveSatisfiedWayIn(
      LIST,
      partialMap,
      evaluation(['root', 'grp-member', 'grp-general']),
    );
    // w-member satisfied at the tree level but unmapped - not derivable.
    expect(result.winner?.wayInId).toBe('w-general');
  });
});
