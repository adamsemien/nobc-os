// TEMPORARY — Sentry verification route. Throws on purpose so the
// onRequestError hook (instrumentation.ts) can be verified server-side on the
// preview deploy. Remove together with app/sentry-example-page/ once events
// are confirmed in the Sentry dashboard.
export const dynamic = 'force-dynamic';

export function GET() {
  throw new Error('Sentry example SERVER error — safe to ignore');
}
