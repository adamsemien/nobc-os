/** Resolve the current runtime environment for the operator UI: which instance this is,
 *  what colour signals it, and where the other environments live. Server-side (reads
 *  Vercel's VERCEL_* build/runtime vars); render the result into the <EnvBadge> client
 *  component as plain serializable props.
 *
 *  kind is driven by VERCEL_ENV (production | preview | development), overridable with an
 *  explicit NEXT_PUBLIC_APP_ENV. A "sandbox" is a Vercel preview/staging deployment
 *  wired to the dev Clerk instance + a Neon branch — never production data. */

export type AppEnvKind = 'production' | 'sandbox' | 'local';

export type AppEnvLink = { label: string; url: string; current: boolean };

export type AppEnvInfo = {
  kind: AppEnvKind;
  /** Loud, uppercase: PRODUCTION | SANDBOX | LOCAL. */
  label: string;
  /** Semantic colour token for the badge: danger=prod, warning=sandbox, muted=local. */
  colorVar: string;
  softVar: string;
  branch: string | null;
  sha: string | null;
  deploymentUrl: string | null;
  /** Every known environment + a "you are here" marker — the consolidated switcher. */
  environments: AppEnvLink[];
};

const PROD_URL = 'https://app.thenobadcompany.com';
/** Stable git-branch alias — points at the latest default-branch sandbox build. Used
 *  only when NEXT_PUBLIC_SANDBOX_URL is unset and we are not running inside a preview
 *  deployment, so the Sandbox switcher entry always resolves to something sensible. */
const STABLE_SANDBOX_URL =
  'https://nobc-os-git-main-adam-semiens-projects.vercel.app';

const META: Record<AppEnvKind, { label: string; colorVar: string; softVar: string }> = {
  production: { label: 'PRODUCTION', colorVar: 'var(--danger)', softVar: 'var(--danger-soft)' },
  sandbox: { label: 'SANDBOX', colorVar: 'var(--warning)', softVar: 'var(--warning-soft)' },
  local: { label: 'LOCAL', colorVar: 'var(--text-muted)', softVar: 'var(--muted)' },
};

function resolveKind(): AppEnvKind {
  const explicit = process.env.NEXT_PUBLIC_APP_ENV?.toLowerCase();
  if (explicit === 'production' || explicit === 'sandbox' || explicit === 'local') return explicit;
  switch (process.env.VERCEL_ENV) {
    case 'production':
      return 'production';
    case 'preview':
      return 'sandbox';
    default:
      return 'local';
  }
}

/**
 * Resolve the canonical sandbox origin. Priority:
 * 1. Explicit NEXT_PUBLIC_SANDBOX_URL (build-time, set in Vercel Preview scope).
 * 2. When running inside a preview deployment, use the current deploy's own branch-alias
 *    origin (VERCEL_BRANCH_URL is a bare host, available at runtime in the Node env).
 * 3. Fallback to the known stable sandbox alias so the switcher entry is never missing.
 */
function resolveSandboxOrigin(kind: AppEnvKind): string {
  if (process.env.NEXT_PUBLIC_SANDBOX_URL) return process.env.NEXT_PUBLIC_SANDBOX_URL;
  if (kind === 'sandbox' && process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  }
  return STABLE_SANDBOX_URL;
}

export function getAppEnv(): AppEnvInfo {
  const kind = resolveKind();
  const meta = META[kind];
  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;

  const sandboxOrigin = resolveSandboxOrigin(kind);

  const environments: AppEnvLink[] = [
    { label: 'Production', url: `${PROD_URL}/operator`, current: kind === 'production' },
    { label: 'Sandbox', url: `${sandboxOrigin}/operator`, current: kind === 'sandbox' },
  ];

  return {
    kind,
    label: meta.label,
    colorVar: meta.colorVar,
    softVar: meta.softVar,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    deploymentUrl,
    environments,
  };
}
