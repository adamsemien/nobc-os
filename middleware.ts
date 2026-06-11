import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/m(.*)',
  '/operator(.*)',
  '/onboarding(.*)',
  '/check-in(.*)',
  '/qa-panel(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
}, { authorizedParties: ['https://app.thenobadcompany.com'] });

export const config = {
  matcher: [
    '/((?!_next|icon|apple-icon|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
