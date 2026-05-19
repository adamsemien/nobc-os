# Overnight Build — Summary

Build: ticketing-v2-with-tags · Run date: 2026-05-18

## What shipped

| Phase | Item | Status |
|-------|------|--------|
| 0 | Schema amendments (Tag, EntityTag, SponsorBrandProfile, GeneratedAsset, SeriesSponsor FK, Workspace back-relations) | ✅ |
| 1 | Migration applied | ❌ — **prepared, not applied** (see Blockers) |
| 2 | TicketTier CRUD | ✅ |
| 3 | Event Builder Access Step UI (tier manager) | ❌ — not started (see What's next) |
| 4 | EventSeries CRUD + Series Tab | 🔶 — **backend ✅**, Series Tab UI ❌ |
| 5 | MCP tool stubs | ✅ |

`prisma generate` clean. `tsc --noEmit` clean. ESLint clean on every new/changed file.

### Phase 0 — schema
- Added enums `TagEntityType`, `TagSource`; models `Tag`, `EntityTag`,
  `SponsorBrandProfile`, `GeneratedAsset`.
- `SeriesSponsor.sponsorBrandId` upgraded from a plain String to a real FK
  relation to `SponsorBrandProfile`.
- `Workspace` gained back-relations: `tags`, `entityTags`,
  `sponsorBrandProfiles`, `generatedAssets`.
- `PaymentStatus` already had `PARTIALLY_REFUNDED` / `COMP` — no change needed.

### Phase 2 — TicketTier CRUD
- `lib/ticketing/tiers.ts` — `create / update / delete / reorder / listTicketTiers`.
  Workspace-scoped, XOR event-or-series scope enforced in the app layer,
  `AuditEvent` (via `emitEvent`) on every mutation. `delete` refuses tiers with
  sold/held tickets; `update` refuses a quantity below sold+held.
- `lib/ticketing/tier-schema.ts` — Zod schemas + ISO-string→Date converters.
- API: `app/api/operator/ticket-tiers` (GET/POST), `/[id]` (PATCH/DELETE),
  `/reorder` (POST).

### Phase 4 — EventSeries (backend only)
- `lib/series.ts` — `create / update / delete / listEventSeries` +
  `generateInstances`. `delete` refuses a series with captured orders (and
  clears `SeriesSponsor` rows first — that FK is RESTRICT). `generateInstances`
  expands the RRULE via `rrule.js` from `startsAt`, bounded by `count` or
  `endsAt`, caps at 200, skips occurrences that already have an instance, and
  creates DRAFT `Event` rows inheriting the series defaults.
- `lib/series-schema.ts` — Zod schemas + converters.
- API: `app/api/operator/series` (GET/POST), `/[id]` (PATCH/DELETE),
  `/[id]/generate` (POST).
- Added the `rrule` dependency.

### Phase 5 — MCP tools
- `ticketingTools()` added to the `/api/mcp` dispatcher:
  - `ticketing.tier.{create,update,delete,list,reorder}` — real (wraps Phase 2)
  - `series.{create,update,list,generate_instances,cancel}` — real (wraps Phase 4;
    `cancel` deactivates rather than hard-deletes)
  - `tag.{create,list,apply,remove,bulk_apply}` — real, direct workspace-scoped queries
  - `ticketing.order.{list,get}`, `ticketing.promo.list` — real read-only
  - `ticketing.order.create`, `promo.{create,redeem}`,
    `access_token.{generate,revoke}`, `comp.issue` — stubs returning a clear
    `not_implemented` payload (await the Stripe integration)

## How to preview locally

1. **Apply the migration first** — none of the new tables exist in the DB yet:
   ```
   ./node_modules/.bin/prisma migrate deploy
   ./node_modules/.bin/prisma generate
   ```
   (See `docs/overnight-blockers.md` for why `migrate dev` will not work.)
2. Start the dev server: `npm run dev` → http://localhost:3000
3. Exercise the new APIs (operator session required):
   - `GET /api/operator/ticket-tiers?eventId=…`
   - `POST /api/operator/ticket-tiers` — body: `{ eventId, name, quantity }`
   - `POST /api/operator/series` — body:
     `{ name, recurrenceRule: "FREQ=WEEKLY;BYDAY=TH", startsAt, count }`
   - `POST /api/operator/series/{id}/generate`
   - `GET /api/mcp` — confirms the new `ticketing.*` / `series.*` / `tag.*` tools
     appear in the manifest.

No new UI surface to click yet — Phases 3 and the Series Tab are not built.

## Blockers encountered

See `docs/overnight-blockers.md` (BLOCKER 1). In short: the migration is
purely-additive and reviewed but **not applied** — pre-existing RSVP-column
drift makes `prisma migrate dev` demand a forbidden reset. Apply with
`prisma migrate deploy`. Per the in-session decision, the migration was held
and Phases 2/4/5 were written as typecheck-verified code against the
regenerated client.

## What I'd tackle next

1. **Apply the migration** (`prisma migrate deploy`) — unblocks runtime testing
   of everything in Phases 2/4/5.
2. **Phase 3 — Event Builder Access Step UI.** Replace the single-price field
   with a tier manager (add/edit/delete/reorder, member + non-member price,
   quantity, dates, visibility, min/max per order, refund-policy override),
   keeping the flat `nonMemberPriceCents` as a collapsed "legacy" section.
   Consumes the Phase 2 API. CSS variables only.
3. **Phase 4 — Series Tab UI.** Create-series flow with an RRULE builder
   (frequency, byDay, startsAt, count/endsAt), defaults section, a "Generate N
   instances" action, and a series detail page listing instances. Open design
   question: where the Series surface lives (a tab on `/operator/events`, or a
   new `/operator/series` route) — needs an Adam decision.

Both UI phases were deferred deliberately: they rework core operator UI, can
only be meaningfully verified once the migration is applied, and Phase 4's
surface placement is unspecified.

Not in scope (per the plan): Stripe / PaymentIntent, buyer-facing pages,
`/apply` changes, archetype rescore.

## Commits (local only — nothing pushed)

- `5758db8` feat(schema): ticketing v2 + tags + sponsors
- `3822ea1` feat(ticketing): TicketTier CRUD API + shared logic layer
- `42f7456` feat(series): EventSeries CRUD + RRULE instance generation
- `9d39c2c` feat(mcp): ticketing v2, series + tag tools

`main` is 4 commits ahead of `origin/main`. No `git push`, no `vercel deploy`.
Note: unrelated in-progress work (Y2K theme, event-access edits) was left
untouched in the working tree — not part of these commits.
