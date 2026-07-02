import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Fence on the /apply `?dev=true` / `?demo=true` URL params (2026-07-02).
 *
 * Previously both params worked for ANY production visitor - and isDemo skips
 * required-field validation, a public backdoor into submitting empty
 * applications. The fence: the flags activate only in local development or for
 * a signed-in member of the workspace's Clerk organization (useAuth().orgId -
 * applicants are personal accounts and never carry an org).
 *
 * MembershipForm is a React component the vitest harness can't import (same
 * constraint as apply-hardening.test.ts), so this test (1) source-scans the
 * wiring, and (2) EXTRACTS the pure resolveApplyDevFlags function from the
 * component source, strips its known type annotations, evaluates it, and
 * proves the behavior matrix on the exact bytes that ship.
 */

const form = readFileSync(
  resolve(process.cwd(), 'app/apply/_components/MembershipForm.tsx'),
  'utf8',
);

function extractResolver(): (
  nodeEnv: string | undefined,
  isWorkspaceOperator: boolean,
  devParam: string | null,
  demoParam: string | null,
) => { isDev: boolean; isDemo: boolean } {
  const m = form.match(/function resolveApplyDevFlags\([\s\S]*?\n\}/);
  if (!m) throw new Error('resolveApplyDevFlags not found in MembershipForm.tsx');
  const js = m[0]
    .replace('): { isDev: boolean; isDemo: boolean } {', ') {')
    .replace(': string | undefined', '')
    .replace(': boolean', '')
    .replace(/: string \| null/g, '');
  // Evaluating the exact shipped source is the point of this test.
  return new Function(`return (${js});`)() as ReturnType<typeof extractResolver>;
}

describe('wiring - the flags are only set through the fenced resolver', () => {
  it('imports useAuth and reads the Clerk org membership signal', () => {
    expect(form).toContain("import { useAuth } from '@clerk/nextjs';");
    expect(form).toContain('const { orgId } = useAuth();');
  });

  it('derives isDev/isDemo from resolveApplyDevFlags with NODE_ENV + orgId + both params', () => {
    expect(form).toMatch(
      /const \{ isDev, isDemo \} = resolveApplyDevFlags\(\s*process\.env\.NODE_ENV,\s*!!orgId,\s*searchParams\.get\('dev'\),\s*searchParams\.get\('demo'\),?\s*\);/,
    );
  });

  it('no unguarded param read remains anywhere in the file', () => {
    expect(form).not.toMatch(/searchParams\.get\('dev'\) === 'true'/);
    expect(form).not.toMatch(/searchParams\.get\('demo'\) === 'true'/);
  });
});

describe('behavior - evaluated from the shipped source', () => {
  const resolveApplyDevFlags = extractResolver();

  it('(a) production, non-operator: dev/demo params are silently inert', () => {
    expect(resolveApplyDevFlags('production', false, 'true', 'true')).toEqual({
      isDev: false,
      isDemo: false,
    });
    // Variant spellings never worked and still do not.
    expect(resolveApplyDevFlags('production', false, '1', '1')).toEqual({
      isDev: false,
      isDemo: false,
    });
    // NODE_ENV=test behaves like production (fail closed outside development).
    expect(resolveApplyDevFlags('test', false, 'true', 'true')).toEqual({
      isDev: false,
      isDemo: false,
    });
  });

  it('(b) development: behavior unchanged - isDev always on, demo honored via param', () => {
    expect(resolveApplyDevFlags('development', false, null, null)).toEqual({
      isDev: true,
      isDemo: false,
    });
    expect(resolveApplyDevFlags('development', false, null, 'true')).toEqual({
      isDev: true,
      isDemo: true,
    });
  });

  it('(c) production, workspace operator: params still honored', () => {
    expect(resolveApplyDevFlags('production', true, 'true', null)).toEqual({
      isDev: true,
      isDemo: false,
    });
    expect(resolveApplyDevFlags('production', true, null, 'true')).toEqual({
      isDev: false,
      isDemo: true,
    });
  });

  it('operator without params sees the normal form (flags stay off)', () => {
    expect(resolveApplyDevFlags('production', true, null, null)).toEqual({
      isDev: false,
      isDemo: false,
    });
  });
});
