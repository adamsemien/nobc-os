// Sentry — Node.js server runtime. Errors only: tracing and replay are OFF
// (quota + privacy). Enabled ONLY on Vercel production/preview so local dev
// never spends the error quota. All credentials come from env — never hardcode.
import * as Sentry from '@sentry/nextjs';
import type { ErrorEvent } from '@sentry/nextjs';

// This platform carries application answers, SMS bodies, private notes, and
// payment fields. beforeSend strips request bodies/cookies/auth wholesale and
// pattern-redacts everything else by key. Duplicated verbatim in
// sentry.edge.config.ts / instrumentation-client.ts — the three bundles are
// separate entry points and must not share imports.
const SENSITIVE_KEY_RE =
  /answer|message|body|note|token|password|secret|card|cvc|authorization|cookie|phone|sms/i;
const SENSITIVE_HEADER_RE = /^(authorization|cookie|set-cookie|x-api-key)$/i;

function redactDeep(value: unknown, depth: number, seen: WeakSet<object>): void {
  if (depth <= 0 || value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) redactDeep(item, depth - 1, seen);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      obj[key] = '[Filtered]';
    } else {
      redactDeep(obj[key], depth - 1, seen);
    }
  }
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  try {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      if (event.request.headers) {
        for (const key of Object.keys(event.request.headers)) {
          if (SENSITIVE_HEADER_RE.test(key) || SENSITIVE_KEY_RE.test(key)) {
            delete event.request.headers[key];
          }
        }
      }
    }
    if (event.user) {
      // Keep only the id; never email/ip/username.
      event.user = event.user.id !== undefined ? { id: event.user.id } : undefined;
    }
    const seen = new WeakSet<object>();
    redactDeep(event.extra, 6, seen);
    redactDeep(event.contexts, 6, seen);
    redactDeep(event.request, 6, seen);
    if (event.breadcrumbs) {
      for (const crumb of event.breadcrumbs) redactDeep(crumb.data, 6, seen);
    }
    // Keep stack traces (needed to debug) but drop captured local variables.
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        for (const frame of ex.stacktrace?.frames ?? []) delete frame.vars;
      }
    }
    return event;
  } catch {
    // Fail closed: if the scrubber itself breaks, strip the risky sections
    // entirely rather than sending them unscrubbed.
    delete event.request;
    delete event.extra;
    delete event.breadcrumbs;
    delete event.user;
    return event;
  }
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled:
    process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview',
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  ...(process.env.VERCEL_GIT_COMMIT_SHA
    ? { release: process.env.VERCEL_GIT_COMMIT_SHA }
    : {}),
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
