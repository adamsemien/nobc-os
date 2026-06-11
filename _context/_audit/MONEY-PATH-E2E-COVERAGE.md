# Money Path E2E Coverage Map

**Created:** 2026-06-11  
**Branch:** `test/money-path-e2e`  
**Scope:** Member-facing access + payment flows for the NoBC OS event registration system.

---

## Coverage Table

| # | Scenario | Type | Status | File(s) | Notes |
|---|---|---|---|---|---|
| 1 | Member registers for open event ("Reserve My Spot" → "You're on the list") | E2E | ✅ Covered | `tests/e2e/access-open-event.spec.ts` | Requires seed: `seed-test-open-event.ts` |
| 2 | Open event CTA is never labeled "RSVP" | E2E | ✅ Covered | `tests/e2e/access-open-event.spec.ts` | Copy-compliance guard |
| 3 | Apply-required event — "Apply to Attend" CTA | E2E | ✅ Covered | `tests/e2e/access-apply-required.spec.ts` | Requires seed: `seed-test-apply-event.ts` |
| 4 | Apply-required event — pending state (not raw "WAITLISTED") | E2E | ✅ Covered | `tests/e2e/access-apply-required.spec.ts` | Pending display string assertion |
| 5 | Apply-required event — CTA copy-compliance ("Apply to Attend" not "RSVP"/"Register") | E2E | ✅ Covered | `tests/e2e/access-apply-required.spec.ts` | Locked copy guard |
| 6 | Ticketed event — guest Stripe checkout (4242 card → "You're on the list") | E2E | ✅ Covered (pre-existing) | `tests/e2e/guest-checkout.spec.ts` | Requires seed: `seed-test-ticketed-event.ts` |
| 7 | Ticketed event — operator comp bypass (STAFF+ → no Stripe charge) | E2E | ✅ Covered | `tests/e2e/access-comp-ticket.spec.ts` | Uses shared operator storageState |
| 8 | Ticketed event CTA shows non-zero price (price-integrity E2E guard) | E2E | ✅ Covered | `tests/e2e/access-comp-ticket.spec.ts` (price-integrity test) | Covers `$0` regression on page render |
| 9 | At-capacity event — new registrant is waitlisted (not confirmed) | E2E | ✅ Covered | `tests/e2e/access-capacity-waitlist.spec.ts` | Requires seed: `seed-test-full-event.ts` |
| 10 | Waitlisted state shows display string — never raw "WAITLISTED" | E2E | ✅ Covered | `tests/e2e/access-capacity-waitlist.spec.ts` | Enum-exposure guard |
| 11 | Full event CTA does not pre-emptively read "Event is full" | E2E | ✅ Covered | `tests/e2e/access-capacity-waitlist.spec.ts` | UX guard |
| 12 | EventAccess Zod silent-strip trap: `{ gate: 'pay' }` must NOT produce empty gates | Unit | ✅ Covered | `tests/unit/event-access-price-integrity.test.ts` | Root cause documented in seed-test-ticketed-event.ts |
| 13 | Legacy `flow: ['pay']` format migrates to ticket gate with preserved priceCents | Unit | ✅ Covered | `tests/unit/event-access-price-integrity.test.ts` | |
| 14 | Default/garbage input falls back to `defaultEventAccess()` | Unit | ✅ Covered | `tests/unit/event-access-price-integrity.test.ts` | (also in event-access.test.ts) |
| 15 | Canonical EventAccess passes through parseEventAccess unchanged | Unit | ✅ Covered | `tests/unit/event-access-price-integrity.test.ts` | |
| 16 | Pay-after-approval: in-session flow cuts at approval → effective price=0 at apply step | Unit | ✅ Covered | `tests/unit/event-access-price-integrity.test.ts` | |
| 17 | Member vs guest tier pricing (`selectTierPriceCents`) | Unit | ✅ Covered (pre-existing) | `tests/unit/ticketing-pricing.test.ts` | |
| 18 | Stripe refund action for PaymentIntent status | Unit | ✅ Covered (pre-existing) | `tests/unit/ticketing-pricing.test.ts` | |
| 19 | Atomic capacity gate (TOCTOU race) | Unit | ✅ Covered (pre-existing) | `tests/unit/rsvp-capacity.test.ts` | |
| 20 | Plus-one persisted/stripped by event setting | Unit | ✅ Covered (pre-existing) | `tests/unit/rsvp-capacity.test.ts` | |
| 21 | Red list → silent fake-success, audited, no RSVP write | Unit | ✅ Covered (pre-existing) | `tests/unit/rsvp-capacity.test.ts` | |
| 22 | Already confirmed → 409 idempotency | Unit | ✅ Covered (pre-existing) | `tests/unit/rsvp-capacity.test.ts` | |
| 23 | Waitlist auto-promote (atomic claim, email outside tx) | Unit | ✅ Covered (pre-existing) | `tests/unit/waitlist-promote.test.ts` | |
| 24 | Ticket confirmation email (QR embed, recipient resolution, dedup guard) | Unit | ✅ Covered (pre-existing) | `tests/unit/ticket-confirmation-email.test.ts` | |
| 25 | Guest non-member checkout mints member-QR (orgless buyer) | E2E | ✅ Covered (pre-existing) | `tests/e2e/guest-checkout.spec.ts` | Checks QR via ticket confirmation |
| 26 | Plus-ones E2E (member adds a +1 during open registration) | E2E | ⚠️ Deferred | — | See "Deferred" section |
| 27 | Comp Access happy path (operator issues comp ticket to a specific member) | E2E | ⚠️ Deferred | — | See "Deferred" section |
| 28 | Payment failure / Stripe card decline (4000 0000 0000 9995 card) | E2E | ⚠️ Deferred | — | See "Deferred" section |
| 29 | 3DS card flow (4000 0027 6000 3184 card) | E2E | ⚠️ Deferred | — | See "Deferred" section |
| 30 | Tier-based pricing (tierId in POST body → tier price overrides event price) | E2E | ⚠️ Deferred | — | See "Deferred" section |
| 31 | Operator refund (ADMIN captures then refunds a PaymentIntent) | E2E | ⚠️ Deferred | — | See "Deferred" section |
| 32 | Duplicate submit (submit twice → 409 idempotency reflected in UI) | E2E | ⚠️ Deferred | — | See "Deferred" section |
| 33 | Past event → "closed" gate, no registration CTA | E2E | ⚠️ Deferred | — | See "Deferred" section |

---

## How to Run

### Prerequisites

1. **Test environment** — do NOT run against Neon production.  
   Use `.env.test.local` with:
   - `DATABASE_URL` → a Neon **dev branch** or local Postgres (not the production `ep-twilight-forest-…` endpoint)
   - `STRIPE_SECRET_KEY` → Stripe **test-mode** key (`sk_test_…`)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → Stripe test publishable key (`pk_test_…`)
   - `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → Clerk **dev** keys (already in `.env.test.local`)

2. **Seed the test events** (one-time, idempotent):
   ```bash
   npx tsx scripts/seed-test-ticketed-event.ts   # guest-checkout.spec.ts + comp-ticket.spec.ts
   npx tsx scripts/seed-test-open-event.ts        # access-open-event.spec.ts
   npx tsx scripts/seed-test-apply-event.ts       # access-apply-required.spec.ts
   npx tsx scripts/seed-test-full-event.ts        # access-capacity-waitlist.spec.ts
   ```
   These scripts are idempotent (`upsert` on `workspaceId_slug`). Re-running is safe.

3. **Create test Clerk users** (one-time setup):
   - `operator-e2e@thenobadcompany.com` — exists in Clerk dev org with ADMIN/STAFF role,  
     must have an approved `Member` row in the DB. Used by the shared `operator.json` storageState.
   - `CLERK_TEST_GUEST_EMAIL` / `CLERK_TEST_GUEST_PASSWORD` — a Clerk user with **no** approved  
     `Member` row (signs in as `viewer="guest"`). Required only by `guest-checkout.spec.ts`.

4. **Start the dev server** (plain webpack, NOT `--turbopack` — Playwright does not support turbopack):
   ```bash
   node_modules/.bin/next dev
   ```

5. **Run the E2E suite**:
   ```bash
   # Full suite
   npm run test:e2e

   # Individual spec
   node_modules/.bin/playwright test tests/e2e/access-open-event.spec.ts
   node_modules/.bin/playwright test tests/e2e/access-apply-required.spec.ts
   node_modules/.bin/playwright test tests/e2e/access-capacity-waitlist.spec.ts
   node_modules/.bin/playwright test tests/e2e/access-comp-ticket.spec.ts
   node_modules/.bin/playwright test tests/e2e/guest-checkout.spec.ts
   ```

6. **Run the unit suite**:
   ```bash
   npm run test:unit
   # Or just the new price-integrity suite:
   node_modules/.bin/vitest run tests/unit/event-access-price-integrity.test.ts
   ```

---

## Fixtures and Mocks the Team Must Supply

| Requirement | For spec | Action needed |
|---|---|---|
| `STRIPE_SECRET_KEY=sk_test_…` in `.env.test.local` | `guest-checkout.spec.ts`, `access-comp-ticket.spec.ts` | Add Stripe test key to local test env |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…` in `.env.test.local` | Same | Add Stripe test publishable key |
| `CLERK_TEST_GUEST_EMAIL` + `CLERK_TEST_GUEST_PASSWORD` in `.env.test.local` | `guest-checkout.spec.ts` | Create guest Clerk user in dev dashboard |
| `operator-e2e@thenobadcompany.com` Clerk user with approved Member row | All specs using shared storageState | Create in Clerk dev dashboard, add to org, run auth.setup.ts |
| Neon dev branch (not prod) as `DATABASE_URL` | All specs | Create a Neon dev branch; do NOT point at `ep-twilight-forest-…` prod endpoint |
| Seed events (see above) | All E2E specs | Run the four seed scripts above |

**No new npm dependencies were installed.** The existing Playwright + `@clerk/testing` setup handles everything.

---

## Deferred Scenarios and Rationale

### Plus-ones E2E (#26)
The plus-one unit test in `rsvp-capacity.test.ts` covers the data layer (trimming, persist/strip by event flag). An E2E test requires a seed event with `plusOnesAllowed: true` and a form step that exposes the plus-one input in `EventAccessFlow`. The component path exists but the E2E selector depends on which registration style is active. Deferred pending a seed script and confirmed UI selectors.

### Comp Access operator issuance (#27)
The operator comp-ticket _bypass_ (operator registers themselves for a paid event without Stripe) is covered in `access-comp-ticket.spec.ts`. The separate operator-issued comp (ADMIN issues a comp ticket to a _specific_ member via the comp access modal in the operator dashboard) requires a different flow and different seed data. Deferred — lower priority than the member-facing money path.

### Payment failure / decline (#28)
Requires a Stripe test card that declines (`4000 0000 0000 9995`). The flow should display an in-line Stripe error (not a crash). The `EventAccessFlow` PayStep passes Stripe's error object to the UI. This is important for UX but does not affect data integrity. Deferred — the guest-checkout happy path is higher priority. The team should add this before a public launch.

### 3DS card (#29)
The 3DS card (`4000 0027 6000 3184`) triggers a redirect within the Stripe hosted frame. Testing this with Playwright requires intercepting the 3DS challenge iframe — more complex than the standard card. The payment-intent route uses `redirect: 'if_required'` which handles 3DS inline, but the challenge iframe makes Playwright assertions brittle. Deferred.

### Tier-based pricing (#30)
Requires a seeded `TicketTier` row attached to a test event, and `tierId` passed in the POST body. The `selectTierPriceCents` logic is covered by `ticketing-pricing.test.ts` at the unit level. E2E coverage deferred until the ticket-tier selector UI is stable.

### Operator refund (#31)
Requires Stripe test capture then refund via `/api/stripe/refund`. This is an operator-panel flow, not a member-facing flow. The `refundActionForStatus` logic is covered at the unit level. E2E deferred — it needs a separate operator-panel spec and a seeded confirmed/captured RSVP.

### Duplicate submit idempotency (#32)
The 409 idempotency is covered at the unit level (`rsvp-capacity.test.ts` — "already confirmed: 409"). E2E coverage (double-clicking the submit button) deferred — the UI may disable the button on first click, making the double-submit hard to trigger.

### Past event / closed gate (#33)
A past event resolves to `{ kind: 'closed', reason: 'This gathering has passed' }` via `loadAccessContext` (the `startAt < new Date()` guard in `event-access-submit.ts`). The `warmClosedCopy` unit tests in `event-access.test.ts` cover the copy mapping. E2E deferred — requires a seed event with `startAt` in the past, which conflicts with the "30 days in the future" requirement in other seeds. A separate past-event seed script would be needed.

---

## Price-Integrity Regression — Approach Used

The `{ gate: 'pay' }` Zod silent-strip bug (root-caused 2026-06-10) operates at the schema-parse layer, not at the rendered UI layer. We cover it at **both** levels:

1. **Unit level** (`tests/unit/event-access-price-integrity.test.ts`):  
   Tests `parseEventAccess` with the legacy `{ gate: 'pay' }` shape directly, asserts that `deriveFlow(parsed.guest.gates)` includes `'pay'` and that `priceCents` is preserved. A separate test documents the _broken_ state (empty gates → price 0) so the invariant is explicit.

2. **E2E level** (`tests/e2e/access-comp-ticket.spec.ts` — "price-integrity guard" test):  
   Navigates to the ticketed event page and asserts the CTA button text contains a non-zero dollar amount (`$25`, not `$0`). This guards the rendered output, independent of the seed shape.

Both levels are needed: the unit test is faster and more precise (catches parse regressions before they reach the render); the E2E test guards the full stack from seed → parse → render.

---

## Known Gaps (intentional)

- **Stripe test keys not committed.** `.env.test.local` contains Clerk dev keys but not Stripe test keys. Add `STRIPE_SECRET_KEY=sk_test_…` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…` to `.env.test.local` before running `guest-checkout.spec.ts`.
- **`APPLY_DEFAULT_WORKSPACE_ID` not set in test env.** The submit route for unauthenticated (guest) flow looks up `workspaceId` from the event. This works for the seeded slugs. Set `APPLY_DEFAULT_WORKSPACE_ID` if multi-tenant workspace resolution is needed for future tests.
- **No CI pipeline configuration.** The specs are file-complete but no GitHub Actions workflow runs them. Recommendation: add a workflow that starts the dev server, runs `seed-test-*.ts` scripts, then runs `npm run test:e2e` — only against a Neon dev branch, never prod.
- **`waitlist-promote` auto-promote is unit-only.** The full cycle (cancel RSVP → promoteFromWaitlist → waitlist-notification email) is unit-tested but not E2E-tested. An E2E test of the auto-promote path would require coordinating two user sessions (one cancels, one is on the waitlist). Deferred.
