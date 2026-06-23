/** Two-tier Claude model policy for every runtime Anthropic call.
 *
 *  JUDGMENT_MODEL   - judgment / member-facing tasks (scoring, personalization,
 *                     application tagging, event builder, event descriptions,
 *                     intelligence composer, operator chat agent).
 *  MECHANICAL_MODEL - mechanical / bulk tasks (DAM alt-text, firmographics
 *                     backfill, SMS triage/categorization, recap/sponsor
 *                     narratives).
 *
 *  These are the locked model strings (see CLAUDE.md > Locked Decisions). The
 *  prior single locked model `claude-sonnet-4-20250514` was retired by Anthropic
 *  (now 404 not_found), which is why this is a two-tier policy. Do not substitute
 *  a different model, swap providers, or move a site to a cheaper tier to save
 *  cost - Adam decides model bumps and tier moves explicitly. */
export const JUDGMENT_MODEL = 'claude-sonnet-4-6';
export const MECHANICAL_MODEL = 'claude-haiku-4-5-20251001';
