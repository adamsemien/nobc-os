/**
 * _seed-guard.ts — shared safety guard for seed/fixture scripts.
 *
 * Seed scripts write directly to whatever DATABASE_URL points at. Producer-grade
 * disasters happen when a seed runs against production. This refuses to run when
 * the environment is flagged production, and (defense in depth) when the
 * connection string looks like a known production host.
 *
 * Set NEXT_PUBLIC_ENVIRONMENT=production in the production env (see the launch
 * action plan) so this guard fires there. Local/dev/staging leave it unset.
 */
export function assertNotProduction(): void {
  const env = (process.env.NEXT_PUBLIC_ENVIRONMENT ?? '').toLowerCase();
  if (env === 'production' || env === 'prod') {
    throw new Error(
      'Refusing to seed: NEXT_PUBLIC_ENVIRONMENT is production. Seeds are dev/staging only.',
    );
  }

  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('Refusing to seed: DATABASE_URL is unset.');
  }
  // Opt-in override for the rare case of intentionally seeding a prod-like host.
  if (process.env.SEED_ALLOW_PROD === '1') return;

  // Heuristic: the production Neon branch host. Update if the prod host changes.
  // Dev branch is ep-sweet-term-...; production is ep-twilight-forest-....
  if (url.includes('ep-twilight-forest')) {
    throw new Error(
      'Refusing to seed: DATABASE_URL points at the production Neon host. ' +
        'Point it at the dev branch, or set SEED_ALLOW_PROD=1 to override.',
    );
  }
}
