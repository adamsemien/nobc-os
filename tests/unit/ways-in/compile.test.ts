import { describe, it, expect } from 'vitest';
import { compileWaysIn, CompileError } from '@/lib/ways-in/compile';
import type { CompiledMap, WaysInList } from '@/lib/ways-in/schema';
import { createConditionRegistry } from '@/lib/gate-engine/registry';
import { createDefaultConditionDefs } from '@/lib/gate-engine/conditions/defaults';
import { validateGateSpec } from '@/lib/gate-engine/validate';
import type { GateGroupSpec } from '@/lib/gate-engine/types';

const registry = createConditionRegistry(createDefaultConditionDefs());

/** The No Bad Saturday door in Phase-A types (spec §1 worked example, minus
 *  the Phase-C prove-membership row). */
const NBS: WaysInList = [
  {
    id: 'w-early',
    label: 'Early Bird',
    who: 'anyone',
    requirements: [
      {
        type: 'pay',
        availableUntil: '2026-07-10T23:59:00.000Z',
        maxQuantity: 50,
      },
    ],
    priceCents: 1800,
    approval: 'instant',
    visibility: 'public',
  },
  {
    id: 'w-apply',
    label: 'Apply to Attend',
    who: 'anyone',
    requirements: [{ type: 'apply' }],
    approval: 'instant',
    visibility: 'public',
  },
  {
    id: 'w-apply-discount',
    label: 'Apply + Discount',
    who: 'anyone',
    requirements: [{ type: 'apply' }, { type: 'pay' }],
    priceCents: 1800,
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
  {
    id: 'w-referred',
    label: 'Referred by a member',
    who: 'referred',
    requirements: [{ type: 'referred' }],
    approval: 'instant',
    visibility: 'public',
  },
];

describe('compileWaysIn — OR-of-ANDs shape', () => {
  it('compiles the list to root GROUP(ANY_N, 1) with one GROUP(ALL) per Way In, in order', () => {
    const spec = compileWaysIn(NBS) as GateGroupSpec;
    expect(spec.kind).toBe('GROUP');
    expect(spec.rule).toBe('ANY_N');
    expect(spec.requiredCount).toBe(1);
    expect(spec.children).toHaveLength(5);
    for (const child of spec.children) {
      expect(child.kind).toBe('GROUP');
      expect((child as GateGroupSpec).rule).toBe('ALL');
    }
  });

  it('maps each Phase-A requirement to its condition type', () => {
    const spec = compileWaysIn(NBS) as GateGroupSpec;
    const typesOf = (i: number) =>
      (spec.children[i] as GateGroupSpec).children.map((c) =>
        c.kind === 'CONDITION' ? c.conditionType : c.kind,
      );
    expect(typesOf(0)).toEqual(['PAY']);
    expect(typesOf(1)).toEqual(['ANSWER_QUESTIONS']);
    expect(typesOf(2)).toEqual(['ANSWER_QUESTIONS', 'PAY']); // AND-stack
    expect(typesOf(3)).toEqual(['PAY']);
    expect(typesOf(4)).toEqual(['REFERRED_BY_MEMBER']);
  });

  it("maps 'nothing' to the OPEN condition", () => {
    const spec = compileWaysIn([
      {
        id: 'w-open',
        label: 'Free entry',
        who: 'anyone',
        requirements: [{ type: 'nothing' }],
        approval: 'instant',
        visibility: 'public',
      },
    ]) as GateGroupSpec;
    const cond = (spec.children[0] as GateGroupSpec).children[0];
    expect(cond.kind === 'CONDITION' && cond.conditionType).toBe('OPEN');
  });

  it('PAY config carries price, label, and the window + cap constraints', () => {
    const spec = compileWaysIn(NBS) as GateGroupSpec;
    const pay = (spec.children[0] as GateGroupSpec).children[0];
    expect(pay.kind).toBe('CONDITION');
    if (pay.kind !== 'CONDITION') return;
    expect(pay.config).toEqual({
      priceCents: 1800,
      currency: 'usd',
      label: 'Early Bird',
      availableUntil: '2026-07-10T23:59:00.000Z',
      maxQuantity: 50,
    });
  });

  it('the compiled spec passes the REAL engine validator (depth ceiling included)', () => {
    const result = validateGateSpec(compileWaysIn(NBS), registry);
    expect(result.valid).toBe(true);
  });
});

describe('compileWaysIn — rejections (fail-closed)', () => {
  const base = { who: 'anyone' as const, approval: 'instant' as const, visibility: 'public' as const };

  it("rejects 'screening' with a Phase C pointer", () => {
    expect(() =>
      compileWaysIn([{ ...base, id: 'w1', label: 'Quiz', requirements: [{ type: 'screening' }] }]),
    ).toThrowError(CompileError);
    expect(() =>
      compileWaysIn([{ ...base, id: 'w1', label: 'Quiz', requirements: [{ type: 'screening' }] }]),
    ).toThrowError(/Phase C/);
  });

  it('rejects a pay requirement without priceCents', () => {
    expect(() =>
      compileWaysIn([{ ...base, id: 'w1', label: 'Ticket', requirements: [{ type: 'pay' }] }]),
    ).toThrowError(CompileError);
  });

  it('rejects priceCents without a pay requirement (free is nothing, never pay-at-zero)', () => {
    expect(() =>
      compileWaysIn([
        { ...base, id: 'w1', label: 'Free', requirements: [{ type: 'nothing' }], priceCents: 1000 },
      ]),
    ).toThrowError(CompileError);
  });

  it('rejects duplicate Way In ids', () => {
    expect(() =>
      compileWaysIn([
        { ...base, id: 'dup', label: 'A', requirements: [{ type: 'nothing' }] },
        { ...base, id: 'dup', label: 'B', requirements: [{ type: 'apply' }] },
      ]),
    ).toThrowError(CompileError);
  });

  it('rejects an empty list', () => {
    expect(() => compileWaysIn([] as unknown as WaysInList)).toThrowError(CompileError);
  });
});

describe('compileWaysIn — id stability (proofs survive recompiles)', () => {
  it('carries prior root, group, and condition ids from the CompiledMap', () => {
    const priorMap: CompiledMap = {
      rootNodeId: 'root-1',
      wayIns: {
        'w-general': { groupNodeId: 'grp-general', conditionNodeIds: ['cond-pay'] },
      },
    };
    const spec = compileWaysIn(
      [
        {
          id: 'w-general',
          label: 'General',
          who: 'anyone',
          requirements: [{ type: 'pay' }],
          priceCents: 2600,
          approval: 'instant',
          visibility: 'public',
        },
      ],
      priorMap,
    ) as GateGroupSpec;

    expect(spec.id).toBe('root-1');
    const group = spec.children[0] as GateGroupSpec;
    expect(group.id).toBe('grp-general');
    const cond = group.children[0];
    expect(cond.kind === 'CONDITION' && cond.id).toBe('cond-pay');
  });

  it('a Way In absent from the prior map gets no ids (fresh nodes)', () => {
    const spec = compileWaysIn(NBS, { wayIns: {} }) as GateGroupSpec;
    expect(spec.id).toBeUndefined();
    expect((spec.children[0] as GateGroupSpec).id).toBeUndefined();
  });
});
