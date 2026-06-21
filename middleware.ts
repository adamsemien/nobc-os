import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/m(.*)',
  '/operator(.*)',
  '/onboarding(.*)',
  '/check-in(.*)',
  '/qa-panel(.*)',
]);

// Clerk validates the session token's `azp` (authorized party) claim against this
// list. It was hardcoded to the prod URL only, which rejected the localhost `azp`
// on the dev Clerk instance (the "Invalid JWT azp" handshake loop) — so the app
// could never be run locally. Build it per-environment instead: the prod domain
// always, the current deploy origin (NEXT_PUBLIC_APP_URL, e.g. a Vercel preview),
// and localhost only outside production. In prod, NODE_ENV gates localhost out so
// only real origins are accepted.
//
// Vercel preview deployments run with NODE_ENV='production', so the localhost
// fallback below does NOT cover them. Their browser origin is the per-deploy hash
// URL or the git-branch alias — neither of which is NEXT_PUBLIC_APP_URL — so the
// `azp` claim was rejected and every protected route looped forever in the Clerk
// handshake (constant page reload). Authorize the deploy's own Vercel origins,
// which Vercel injects at runtime as bare hostnames (no scheme), so previews work
// without any per-deploy env wiring.
const vercelOrigins = [
  process.env.VERCEL_URL, // unique per-deploy hash URL
  process.env.VERCEL_BRANCH_URL, // git-branch alias (what users actually navigate to)
  process.env.VERCEL_PROJECT_PRODUCTION_URL, // the project's production alias
]
  .filter((host): host is string => Boolean(host))
  .map((host) => `https://${host}`);

const AUTHORIZED_PARTIES = [
  'https://app.thenobadcompany.com',
  process.env.NEXT_PUBLIC_APP_URL,
  ...vercelOrigins,
  ...(process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:3001']),
].filter((v): v is string => Boolean(v));

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
}, { authorizedParties: AUTHORIZED_PARTIES });

export const config = {
  matcher: [
    '/((?!_next|icon|apple-icon|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
