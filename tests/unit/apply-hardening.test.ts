import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { glob } from 'glob';

/**
 * /apply launch-hardening invariants (FULL-AUDIT-2026-06-21).
 *
 *   BLOCKER 1 — every transactional email's sender DISPLAY NAME is the locked
 *               "The No Bad Company", never the legacy "NoBC". The from ADDRESS
 *               (team@thenobadcompany.com) is unchanged — only the display name.
 *   BLOCKER 4 — the apply photo-upload loop does not silently swallow a failed
 *               upload (no `push('')`); it throws so the form surfaces an error
 *               and blocks submission instead of landing an empty photo key.
 *
 * These are source-scans: the email sends are scattered across many files and
 * the photo-upload logic lives in a React component the vitest harness can't
 * import (no JSX transform), so we pin the invariants at the source level —
 * the same approach as email-hardening.test.ts.
 */

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('BLOCKER 1 — sender display name is "The No Bad Company", never "NoBC"', () => {
  it('no source file sends with the legacy "NoBC <team@..." display name', () => {
    const files = glob.sync('{lib,app,emails}/**/*.{ts,tsx}', {
      cwd: process.cwd(),
      absolute: true,
      ignore: ['**/node_modules/**'],
    });
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (text.includes("'NoBC <team@thenobadcompany.com>'") ||
          text.includes('"NoBC <team@thenobadcompany.com>"')) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the approval welcome email uses the correct locked sender', () => {
    const s = src('lib/applications/approve.ts');
    expect(s).toContain("from: 'The No Bad Company <team@thenobadcompany.com>'");
    expect(s).not.toContain("from: 'NoBC <team@thenobadcompany.com>'");
  });

  it('the shared templated-email FROM constant is the correct locked sender', () => {
    const s = src('lib/email.ts');
    expect(s).toContain("const FROM = 'The No Bad Company <team@thenobadcompany.com>'");
  });
});

describe('BLOCKER 4 — apply photo-upload failures are surfaced, not swallowed', () => {
  const form = src('app/apply/_components/MembershipForm.tsx');

  it('does not silently push an empty string on a failed upload', () => {
    expect(form).not.toContain("uploadedUrls.push('')");
    expect(form).not.toContain('uploadedUrls.push("")');
  });

  it('throws on a non-ok upload response so the form blocks submission', () => {
    // The upload loop must escalate a failed upload to a thrown Error (caught by
    // the outer handleSubmit catch → setError), not continue with a blank key.
    expect(form).toMatch(/if \(!r\.ok\)[\s\S]*throw new Error/);
  });

  it('logs the upload failure with context', () => {
    expect(form).toContain("console.error('[apply/photo-upload]'");
  });
});
