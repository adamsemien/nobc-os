import { describe, it, expect } from 'vitest';
import {
  aggregateTypedScores,
  gradeTypedAnswers,
  TYPED_GRADE_FALLBACK,
  type TypedGrade,
  type TypedQuestionInput,
} from '@/lib/scoring/gradeTypedAnswers';
import { STORED_ARCHETYPES } from '@/lib/scoring/inRoomTally';

const grade = (overrides: Partial<TypedGrade> = {}): TypedGrade => ({
  typedGrades: [],
  memberWorthTotal: 71,
  aiRecommendation: 'yes',
  aiReasoning: 'Concrete, lived answers.',
  tags: ['curious', 'warm'],
  ...overrides,
});

const Q: TypedQuestionInput[] = [
  {
    stableKey: 'whyHere',
    insightLabel: 'Why here',
    scoringDimension: 'contribution',
    scoringWeight: 1,
    scoringLogic: 'Reward specificity.',
    archetypeSignals: ['Connector', 'Host'],
  },
];

describe('aggregateTypedScores', () => {
  it('sums per-question awards into the six-archetype vector', () => {
    const scores = aggregateTypedScores([
      { questionKey: 'q1', awards: [{ archetype: 'Sage', points: 2 }] },
      { questionKey: 'q2', awards: [{ archetype: 'Sage', points: 1 }, { archetype: 'Connector', points: 1 }] },
    ]);
    expect(scores.Sage).toBe(3);
    expect(scores.Connector).toBe(1);
    expect(scores.Host).toBe(0);
  });

  it('is UNCAPPED — aggregate for one archetype may exceed 2 across questions', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      questionKey: `q${i}`,
      awards: [{ archetype: 'Builder' as const, points: 2 }],
    }));
    expect(aggregateTypedScores(many).Builder).toBe(10);
  });

  it('ignores unknown archetypes and non-finite points without throwing', () => {
    const scores = aggregateTypedScores([
      // @ts-expect-error — deliberately invalid archetype for the safety path
      { questionKey: 'q1', awards: [{ archetype: 'Curator', points: 2 }] },
      { questionKey: 'q2', awards: [{ archetype: 'Spark', points: Number.NaN }] },
    ]);
    for (const a of STORED_ARCHETYPES) expect(scores[a]).toBe(0);
  });

  it('handles empty / missing awards arrays', () => {
    const scores = aggregateTypedScores([{ questionKey: 'q1', awards: [] }]);
    for (const a of STORED_ARCHETYPES) expect(scores[a]).toBe(0);
  });
});

describe('gradeTypedAnswers', () => {
  it('returns the injected generator’s grade (no API, no key needed)', async () => {
    const stub = grade({ memberWorthTotal: 84, aiRecommendation: 'strong_yes' });
    const out = await gradeTypedAnswers(Q, { whyHere: 'I build things and pull people in.' }, {
      generate: async () => stub,
    });
    expect(out).toEqual(stub);
    expect(out.memberWorthTotal).toBe(84);
  });

  it('feeds the built prompt to the generator (typed answers reach the model)', async () => {
    let seen = '';
    await gradeTypedAnswers(Q, { whyHere: 'UNIQUE_ANSWER_TOKEN' }, {
      generate: async (prompt) => {
        seen = prompt;
        return grade();
      },
    });
    expect(seen).toContain('UNIQUE_ANSWER_TOKEN');
    expect(seen).toContain('[whyHere]');
    expect(seen).toContain('JOB 1 — FIT');
    expect(seen).toContain('JOB 2 — TYPED AWARDS');
  });

  it('falls back to TYPED_GRADE_FALLBACK when the generator throws', async () => {
    const out = await gradeTypedAnswers(Q, {}, {
      generate: async () => {
        throw new Error('model unavailable');
      },
    });
    expect(out).toEqual(TYPED_GRADE_FALLBACK);
    expect(out.aiRecommendation).toBe('unclear');
    expect(out.memberWorthTotal).toBe(50);
  });
});
