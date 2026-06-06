import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Regression guard for the approval-bypass (audit P0 #3, locked 2026-06-06).
 *
 * No member-creation path EXCEPT the approval gate (`lib/applications/approve.ts`),
 * the PURPLE allowlist (`apply/membership/[id]/submit`), operator manual-create
 * (`api/operator/members/create`), and `promoteMemberToApproved` may set a Member
 * to APPROVED. This is a source-level guard: it greps the routes that previously
 * leaked APPROVED and asserts they no longer assign it.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readF1(resolve(root, p));
function readF1(p: string): string {
  return readFileSync(p, 'utf8');
}

// Match an APPROVED member-status assignment: `status: 'APPROVED'`, `status: "APPROVED"`,
// or `status: MemberStatus.APPROVED`. (RSVP/Application status assignments use other
// enums and live on other shapes; these route files only carry member status here.)
const APPROVED_ASSIGN = /status\s*:\s*(['"]APPROVED['"]|MemberStatus\.APPROVED)/;

describe('approval-bypass regression guard', () => {
  it('plus-one route does not mint APPROVED members', () => {
    const src = read('app/api/rsvp/plus-one/route.ts');
    expect(APPROVED_ASSIGN.test(src)).toBe(false);
    expect(src).toContain('resolveMember');
  });

  it('walk-in route does not promote walk-ins to APPROVED', () => {
    const src = read('app/api/check-in/walkin/route.ts');
    expect(APPROVED_ASSIGN.test(src)).toBe(false);
  });

  it('open-RSVP/checkout member creation does not mint APPROVED', () => {
    const src = read('lib/clerk-member.ts');
    expect(APPROVED_ASSIGN.test(src)).toBe(false);
    expect(src).toContain('resolveMember');
  });

  it('apply-event RSVP member creation does not mint APPROVED', () => {
    const src = read('lib/apply-event-rsvp.ts');
    expect(APPROVED_ASSIGN.test(src)).toBe(false);
    expect(src).toContain('resolveMember');
  });

  it('the approval gate IS still allowed to assign APPROVED (sanity)', () => {
    const src = read('lib/applications/approve.ts');
    expect(APPROVED_ASSIGN.test(src)).toBe(true);
  });
});
