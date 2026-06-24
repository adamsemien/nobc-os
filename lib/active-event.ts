/**
 * The currently active event for Door 1 — the application path that issues a
 * comp RSVP on membership submit (pending_approval), confirms it on approve, and
 * cancels it on reject. Defaults to the July 11 "No Bad Saturday" event; override
 * with the ACTIVE_EVENT_ID env var when the active event rolls over.
 *
 * Never inline the raw id — import this everywhere the Door 1 wiring needs it.
 */
export const ACTIVE_EVENT_ID = process.env.ACTIVE_EVENT_ID ?? 'cmqr8wojk000004kzc90yxxy3';
