// Next.js instrumentation hook — loads the runtime-appropriate Sentry config
// on server start and forwards uncaught request errors (App Router server
// components, route handlers, server actions) to Sentry via onRequestError.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
