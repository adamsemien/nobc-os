import { describe, it, expect } from 'vitest';
import { QUESTIONS } from '@/app/apply/_lib/questions';

/**
 * Pins the photo question's contract with the frozen submit pipeline:
 * MembershipForm's handleSubmit persists picked files under the fixed
 * `photos.urls` answer key, and the operator review API reads the same key.
 * The question itself must never write a colliding answer key, which the form
 * guarantees by excluding `photo` questions from keysForPage/fillSample.
 */
describe('apply photo question config', () => {
  const photoQuestions = QUESTIONS.filter((q) => q.type === 'photo');

  it('exactly one photo question exists', () => {
    expect(photoQuestions).toHaveLength(1);
  });

  it('closes the identity section and is required', () => {
    const q = photoQuestions[0];
    expect(q.id).toBe('photos');
    expect(q.section).toBe('who-you-are');
    expect(q.required).toBe(true);
  });

  it('is never used as a group sub-field', () => {
    for (const q of QUESTIONS) {
      for (const sub of q.fields ?? []) {
        expect(sub.type).not.toBe('photo');
      }
    }
  });
});
