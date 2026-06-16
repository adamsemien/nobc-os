# Check-In Scanner: RBAC Scoping + Proposed Door-Staff Tier

**Date:** 2026-06-15
**Type:** READ-ONLY scoping audit. No source code was modified. This document scopes a NEXT workstream (a staff-RBAC tier below operator for the check-in scanner). It is a proposal, not an implementation.

## Executive summary

The check-in scanner is a camera-based QR reader (zxing `BrowserMultiFormatReader`) backed by an offline-first PWA (Dexie/IndexedDB) at `/check-in/[slug]`. It is gated at the token-mint boundary, not at the route: the page is Clerk-protected by middleware, and the server mints an event-scoped, HMAC-signed check-in token (`CHECKIN_SECRET`) only for an operator who is at least STAFF in the workspace. The three API routes (`event`, `[rsvpId]`, `walkin`) authenticate solely off that token's signature plus event/workspace scope. There is no fourth role: the model is exactly ADMIN > STAFF > READ_ONLY on `WorkspaceMember.role`, and the scanner's effective floor is STAFF. Behavior on valid match and double-scan is well-defined in code; behavior on an unknown or malformed QR is partially defined (the not-found toast is defined, but several edge cases around the cached-vs-live check-in state and the `'error'` status are effectively unreachable or undefined). There is no end-to-end test or seed evidence proving the scanner has fired against a real device. The proposal at the end adds a DOOR tier below STAFF, stored as a new `OperatorRole` enum value, gated entirely at `mintCheckInSession`, with no new API surface required.

---

## Finding 1: Scan input, matching logic, and the three outcomes

### Camera scan, not a text field

The scan is a **camera scan**. `app/check-in/[slug]/_components/CheckInClient.tsx:198` constructs `new BrowserMultiFormatReader()` and `CheckInClient.tsx:202` calls `reader.decodeFromVideoDevice(null, videoRef.current, (result, err) => ...)`, decoding live frames from the `<video>` element (`CheckInClient.tsx:386-391`). On a successful decode, `CheckInClient.tsx:203` calls `handleQrScan(result.getText())`. There is a separate **search text field** (`CheckInClient.tsx:455-471`) for finding guests by name or email, plus manual "Check in" buttons in the list view (`CheckInClient.tsx:549-565`), but the QR path itself is camera-driven, not typed.

### Exact matching logic (around line 165)

`handleQrScan` (`CheckInClient.tsx:163-194`) is the matcher:

- `CheckInClient.tsx:164`: early-returns if `!scannerActive` (scanner not mounted).
- `CheckInClient.tsx:165`: `const rsvp = await checkinDb.rsvps.filter(r => r.memberQrCode === qrCode).first();` — an exact, case-sensitive string equality against the locally cached `memberQrCode` field in IndexedDB (`lib/checkin-db.ts:9`, `CachedRsvp.memberQrCode`). The cache is populated from `/api/check-in/event`, which returns `memberQrCode` per RSVP (`app/api/check-in/event/route.ts:42,61`). Match is against the cached list only; it does not call the server to resolve an unknown code.

### (a) Valid match — DEFINED

When an RSVP is found and is not yet checked in, `CheckInClient.tsx:183` calls `performCheckIn(rsvp.id)`. `performCheckIn` (`CheckInClient.tsx:138-161`) optimistically writes `checkedIn: true` to IndexedDB (`CheckInClient.tsx:146`), queues a pending sync row (`CheckInClient.tsx:147`), updates the UI count (`CheckInClient.tsx:148-151`), and fires `POST /api/check-in/[rsvpId]` in the background (`CheckInClient.tsx:153-156`). On success it shows the green "Checked in" toast (`CheckInClient.tsx:185-192`, `CheckInClient.tsx:422-433`). This path is fully defined.

### (b) Mismatch / unknown code — PARTIALLY DEFINED

If `.first()` returns nothing, `CheckInClient.tsx:167-171` sets `scanResult` to `{ name: qrCode, status: 'not_found' }` and clears it after 3 seconds, rendering "QR not on guest list" (`CheckInClient.tsx:443-445`). The happy "not on list" case is defined. What is **undefined** in code:

- **Unknown code not in the cache but valid on the server.** Because matching is purely local (`CheckInClient.tsx:165`), a legitimate RSVP that was created after the last `fetchGuestList` (or a member checking in at an event whose list never synced) reads as `not_found`. There is no server-side fallback lookup for an unscanned/unknown code. The operator must fall back to the search field or walk-in flow. Behavior is "defined as not_found" but the underlying real-world outcome (valid guest shown as not on list) is an undefined/unhandled gap.
- **Malformed or non-NoBC QR.** Any decoded string that is not a `memberQrCode` simply renders `not_found` with the raw decoded text echoed as `name`. There is no validation that the scanned payload is even a NoBC member QR. Defined behavior, but no distinct handling.
- **The `'error'` status.** `ScanResult.status` includes `'error'` (`CheckInClient.tsx:23`) and renders "Check-in failed — use search" (`CheckInClient.tsx:446-448`), but `handleQrScan` never sets `status: 'error'` for a scan. It is only reachable through code paths that do not exist in the QR flow today, so the error toast is effectively dead/unreachable for scanning. UNDEFINED in practice.

### (c) Double-scan (same code scanned twice) — DEFINED, with a cache-timing nuance

`CheckInClient.tsx:172-182`: if the matched RSVP already has `checkedIn === true` in the cache, it shows the amber "Already in" toast (`CheckInClient.tsx:435-441`) and returns without another write. This is the primary defined double-scan guard, and it reads off the optimistic local flag set by the first scan (`CheckInClient.tsx:146`), so a rapid re-scan of the same code on the same device is handled.

Two layers back this up and make double-scan idempotent end-to-end:

- `performCheckIn` re-reads the live record and returns early if `rsvp.checkedIn` (`CheckInClient.tsx:141`), a second guard if the cache flag was somehow stale.
- The server route is idempotent: `POST /api/check-in/[rsvpId]` returns `{ ok: true, alreadyCheckedIn: true }` when the RSVP is already checked in (`app/api/check-in/[rsvpId]/route.ts`, the "Already checked in — idempotent success" branch), and the MCP `nobc_check_in` tool is likewise idempotent (`lib/mcp/tools/checkin.ts:78-80`).

**Nuance worth flagging (DEFINED but subtle):** double-scan correctness depends on the **local IndexedDB cache** being current. The same QR scanned on **two different devices** within the offline window would pass the cache guard on both (each device's cache shows not-checked-in), both optimistically increment their own count, and both POST to the server. The server's idempotent branch prevents a double DB write and a double `totalEventsAttended` increment, so the data stays correct, but the two devices' on-screen counts can transiently disagree until they re-sync. This is a defined-and-safe-at-the-DB-layer outcome, not a data-integrity bug, but the multi-device count reconciliation is not explicitly handled in the client.

---

## Finding 2: Role gating today — STAFF floor at the mint boundary, token-only at the API

### The role model that exists

`prisma/schema.prisma:89-93` defines exactly three roles:

```
enum OperatorRole {
  ADMIN
  STAFF
  READ_ONLY
}
```

stored on `WorkspaceMember.role` with a `@default(STAFF)` (`prisma/schema.prisma:106`). The hierarchy ADMIN > STAFF > READ_ONLY is encoded in `lib/operator-role.ts:9-13` (`RANK`), with `roleAtLeast` (`lib/operator-role.ts:15-17`), `getEffectiveRole` (the higher of an explicit `WorkspaceMember` grant and the Clerk-org floor, `lib/operator-role.ts:82-94`), `isStaff` (`lib/operator-role.ts:105-110`), and the `requireRole` / `requireRolePage` guards (`lib/operator-role.ts:130-162`). There is **no role below READ_ONLY** and **no check-in-specific role** anywhere in the model today. Check-in is, in effect, **STAFF-and-above** (operator-only at the STAFF tier).

### Where the STAFF gate actually lives

The check-in **routes do not call `requireRole`**. They authenticate purely off the event-scoped signed token. The STAFF gate is enforced one layer up, at token mint:

- `lib/check-in-session.ts:33-34`: `mintCheckInSession` calls `getEffectiveRole(...)` and `if (!roleAtLeast(role, OperatorRole.STAFF)) return null;` — a caller below STAFF gets a null token, and the scanner UI is inert without one.
- The scanner page mints server-side: `app/check-in/[slug]/page.tsx:31` calls `mintCheckInSession({ clerkUserId: userId, workspaceId: ws.id, event })` inside a Clerk-`auth()`-gated server component (page header comment: "minted server-side... only for an operator who is at least STAFF").
- The operator event detail page also mints for its check-in tab, STAFF+ only (`app/operator/events/[id]/page.tsx:162-176`, comment at line 163: "STAFF+ only; null otherwise. Replaces the browser-exposed NEXT_PUBLIC_CHECKIN_SECRET").

### How `/api/check-in/event/route.ts` authenticates — confirmed against code

Confirmed: it matches the summary's description (event-scoped signed tokens minted server-side via `CHECKIN_SECRET`, the PR #59 model). Specifically:

- `app/api/check-in/event/route.ts:10`: `const scope = verifyCheckInToken(bearerToken(req.headers.get('authorization')));` then `:11-13` returns 401 if `scope` is null.
- Scope (workspaceId + eventId) comes from the **token, not query params** (`event/route.ts:15-16` queries `where: { id: scope.eventId, workspaceId: scope.workspaceId }`), so a token for one event can only ever read that one event in its own workspace (route comment, `event/route.ts:5-8`).
- `verifyCheckInToken` (`lib/check-in-token.ts:63-90`) verifies an HMAC-SHA256 signature over a base64url JSON payload, keyed by `process.env.CHECKIN_SECRET` (`lib/check-in-token.ts:64`), using constant-time comparison (`lib/check-in-token.ts:73-76`, `timingSafeEqual`) and enforcing expiry (`lib/check-in-token.ts:87`). If `CHECKIN_SECRET` is unset, both mint and verify **fail closed** (`lib/check-in-token.ts:52,65`).
- The other two routes authenticate identically: `app/api/check-in/[rsvpId]/route.ts:13` and `app/api/check-in/walkin/route.ts:23` both call `verifyCheckInToken(bearerToken(...))`, and `[rsvpId]/route.ts` additionally re-checks that the target RSVP's `workspaceId`/`eventId` equal the token scope before acting ("Out of scope" 403).
- Token expiry is computed from the event window plus a settable buffer (`checkInTokenExpiry`, `lib/check-in-token.ts:102-114`; default 4 hours via `DEFAULT_CHECKIN_VALID_HOURS`, hard-capped at 72 via `MAX_CHECKIN_VALID_HOURS`), read per-workspace from `PlatformSetting` key `checkin.passValidHours` (`lib/check-in-session.ts:11,36-41`).

**Net:** the only role tier gating check-in today is the STAFF floor at `mintCheckInSession` (`lib/check-in-session.ts:34`). The API routes trust the signed token. There is no door-only or below-STAFF tier.

### A note on the MCP check-in tools

The MCP tools are a separate surface with their own role metadata: `nobc_get_checkin_status` is `minRole: OperatorRole.READ_ONLY` (`lib/mcp/tools/checkin.ts:22`) and `nobc_check_in` is marked `destructive: true` (`lib/mcp/tools/checkin.ts:59`) but carries **no explicit `minRole`** in its definition (`lib/mcp/tools/checkin.ts:54-59`); its gating depends on how the MCP dispatcher treats a destructive tool with no `minRole`. The MCP check-in path is not the door-scanner path (it writes `via: 'mcp'` audit metadata, `lib/mcp/tools/checkin.ts:96`) and is out of scope for the scanner RBAC tier, but it is the one place a check-in tool's role floor is ambiguous in code and should be confirmed if the door tier is meant to reach the MCP surface too.

---

## Finding 3: Has check-in ever fired end-to-end? UNKNOWN from the code

There is **no direct code evidence** that the camera-scan -> mint -> POST path has run against a real device or attendee. Specifically:

- **Tests:** the only check-in test is `tests/unit/check-in-token.test.ts`, which unit-tests mint/verify/expiry of the token in isolation (`mintCheckInToken`, `verifyCheckInToken`, signature forgery rejection). There is **no e2e/Playwright spec** for check-in: `tests/e2e/` contains only access, capacity/waitlist, comp-ticket, open-event, guest-checkout, and spotlight specs, and a grep for `check.?in|checkedIn|scanner|QR` across `tests/e2e/` returns nothing. `mintCheckInSession` (the role-gated mint used by both pages) has **no unit test** at all.
- **Seed data:** seed scripts set `checkedIn`/`checkedInAt` **directly in the database** (`scripts/seed-sponsor-recap.ts:126-175` ~80% show-rate flags, `scripts/seed-gravity-ledger.ts:106-145` check-in counts for the gravity ledger). These prove the `checkedIn` columns are exercised by analytics seeds, but they bypass the scanner entirely — they are not evidence the scanner fired.
- **Logs / runtime evidence:** none available in a read-only repo audit. The success path writes an `AuditEvent` with `actorId: 'staff-checkin'` and `action: 'rsvp.checked_in'` (`app/api/check-in/[rsvpId]/route.ts`), so production usage would be detectable in the `AuditEvent` table, but that is a live-DB question, not a code question.

**Honest conclusion:** whether check-in has fired end-to-end in production is **UNKNOWN from the code**. The token primitive is unit-tested; the full device-to-DB scanner flow is not covered by any automated test or reproducible seed.

---

## Finding 4: Is `/check-in` in the protected middleware matcher? Yes

Confirmed. `middleware.ts:7` lists `'/check-in(.*)'` in the `isProtectedRoute` matcher (`createRouteMatcher`, `middleware.ts:3-9`), and `middleware.ts:26-29` calls `await auth.protect()` for any protected route. So `/check-in/[slug]` requires a Clerk session to load. Note the **page** is Clerk-protected (a signed-in user reaches it), while the actual **STAFF authorization** happens at mint time (`lib/check-in-session.ts:34`) and the **API routes** are protected by the signed token, not by `auth.protect()` (the `/api/check-in/*` routes rely on `verifyCheckInToken`, and middleware's matcher covers `/(api|trpc)(.*)` at `middleware.ts:35` but the routes themselves enforce token scope rather than Clerk session). The Clerk middleware gate plus the STAFF mint gate are the two layers; a signed-in but below-STAFF user can load the page but receives a null token and an inert scanner.

---

## PROPOSED: staff-RBAC tier for check-in

> This is a design proposal to scope the next workstream. No code is written here. The current model is exactly three roles, ADMIN > STAFF > READ_ONLY, on `WorkspaceMember.role`. The goal is a first tier **below** operator: a door/check-in-only staffer who can run the scanner for a specific event but cannot see or touch any other operator surface.

### Goal and shape

Introduce a **DOOR** role (working name) that sits below STAFF in the hierarchy: ADMIN > STAFF > DOOR > READ_ONLY. A DOOR staffer can mint and use a check-in token for events in their workspace and nothing else. They are the volunteer or contractor who works the door for one night and should never reach `/operator`, member PII at large, refunds, settings, or the rest of the dashboard.

### Where the role is stored

Reuse the existing `WorkspaceMember.role` column. Add `DOOR` to the `OperatorRole` enum (`prisma/schema.prisma:89-93`) **between STAFF and READ_ONLY**, and slot it into the `RANK` map (`lib/operator-role.ts:9-13`) at rank 2 (shifting READ_ONLY semantics is unnecessary if we insert as a fractional/explicit rank, e.g. READ_ONLY=1, DOOR=2, STAFF=3, ADMIN=4). No new table is needed: a door staffer is just a `WorkspaceMember` with `role = DOOR`. This keeps the single-source-of-truth on the row and reuses `getEffectiveRole` unchanged in structure.

Open question to resolve before building: the **Clerk-org floor** (`lib/operator-role.ts:46-74`) maps a plain Clerk org member to READ_ONLY and a Clerk org admin to ADMIN. A DOOR staffer would need either (a) an explicit `WorkspaceMember` row with `role = DOOR` that elevates them above the READ_ONLY floor (which `getEffectiveRole` already does, since it takes the higher of explicit grant and floor, `lib/operator-role.ts:91-93`), or (b) a decision on whether DOOR staffers are even Clerk org members. Option (a) works cleanly with the existing floor logic and is the recommended path: add the person to the Clerk org as `org:member` (floor READ_ONLY) and grant `WorkspaceMember.role = DOOR`; the explicit grant elevates them to DOOR, and they can never reach STAFF surfaces.

### How the signed-token mint path would gate it

This is the key insight: **the gate is already a single chokepoint.** `mintCheckInSession` (`lib/check-in-session.ts:33-34`) is the only place check-in authority is decided, and the three API routes trust the token. So the entire RBAC change is one comparison:

- Change the mint floor from `roleAtLeast(role, OperatorRole.STAFF)` to `roleAtLeast(role, OperatorRole.DOOR)` (`lib/check-in-session.ts:34`). Because DOOR < STAFF in the new RANK, this *widens* who can mint a check-in token to include DOOR staffers while still excluding READ_ONLY.
- No API route changes are required. `verifyCheckInToken` (`lib/check-in-token.ts:63-90`) does not encode a role in the token payload (`CheckInTokenScope` is workspaceId + eventId + slug, `lib/check-in-token.ts:20-24`), so a DOOR-minted token is indistinguishable from a STAFF-minted one at the API. That is acceptable: the token is already event-and-workspace-scoped and expiry-bounded, so a DOOR staffer's token grants exactly the same narrow capability (read this event's list, check in / walk-in for this event) and nothing more. The role decision is made once, at mint, which is the correct boundary.
- Optional hardening (decide in the workstream): if we want audit trails to distinguish door-staff check-ins, add the minting role (or a `mintedByRole` claim) to the token payload and write it into the `AuditEvent.metadata` on `rsvp.checked_in` (`app/api/check-in/[rsvpId]/route.ts`, which today writes `actorId: 'staff-checkin'`). This is additive and does not change the auth decision.

### What surfaces a DOOR staffer would see / not see

**See:**

- `/check-in/[slug]` — the standalone scanner PWA. It already mints via `mintCheckInSession` (`app/check-in/[slug]/page.tsx:31`); lowering the floor to DOOR makes it usable by door staff with no other change. They see the camera scanner, the guest list (names, tier, comp badge, payment status, `app/api/check-in/event/route.ts:55-69`), the running count, search, and walk-in. This is the intended door surface.

**Not see (must be enforced, not assumed):**

- All of `/operator(.*)` — the dashboard, members, applications, settings, refunds, intelligence, house phone. These are guarded by `requireRolePage` / `requireRole` at STAFF or ADMIN (`lib/operator-role.ts:130-162`), so a DOOR role at rank 2 is automatically below the STAFF floor on every one of those guards and gets redirected/403'd with no further work. This is the main safety property: **inserting DOOR below STAFF means every existing STAFF+ guard keeps DOOR staff out by construction.**
- The operator event detail check-in tab (`app/operator/events/[id]/page.tsx:162-176`) lives under `/operator`, so a DOOR staffer cannot reach it. They use the standalone `/check-in/[slug]` PWA instead. The mint floor change should be applied consistently in both call sites if DOOR staff are ever meant to use the in-dashboard tab (they are not, under this proposal), so the standalone page is the only DOOR entry point.

**Decision needed:** how does a DOOR staffer get the `/check-in/[slug]?workspace=...` link for tonight's event? Today an operator opens it from the dashboard. For door staff, the workstream should define a distribution path (for example, an operator shares the per-event check-in link, or a future "invite door staff to this event" action). The link itself carries no secret (the token is minted per-session for the authenticated DOOR user), so sharing the URL is safe; the recipient still needs a Clerk session and a DOOR grant.

### Scoping consideration: per-event vs workspace-wide DOOR

`WorkspaceMember.role` is **workspace-scoped**, not event-scoped. A DOOR grant therefore lets the staffer mint a token for **any** event in that workspace, not just tonight's. The token itself is then event-scoped (good), but the *ability to mint for any event* is workspace-wide. If the product needs a true per-event door staffer ("can work the door for Event X only"), that is a larger change: it would need either an event-scoped grant table (`EventStaff { eventId, clerkUserId, role }`) consulted inside `mintCheckInSession`, or a per-event invite token. Recommendation: **start with the workspace-wide DOOR role** (smallest viable change, one enum value plus one mint-floor edit) and treat per-event scoping as a follow-on only if a concrete need appears. Premature per-event RBAC would violate the "simplicity first" principle.

### Migration considerations

- **Additive enum change only.** Adding `DOOR` to `OperatorRole` is additive (a new enum value), but per the Absolute Rules this is still a schema change: it must go through the `prisma migrate diff` + `prisma db execute` workflow, never `prisma db push` (which would threaten the DAM GIN index and is doubly dangerous on the shared Postgres). Confirm the generated SQL is a pure `ALTER TYPE ... ADD VALUE` with no DROP/RENAME before applying. Coordinate with Producer if Producer reads `OperatorRole` (verify against the Producer/Operator strategy doc).
- **No data backfill.** Existing rows keep their roles; no member is auto-assigned DOOR. The `@default(STAFF)` on `WorkspaceMember.role` (`prisma/schema.prisma:106`) is unchanged, so new operator invites still default to STAFF as today.
- **RANK insertion is the only logic change in the role lib.** Adding DOOR=2 (and renumbering STAFF=3, ADMIN=4, READ_ONLY=1) in `lib/operator-role.ts:9-13` must be done carefully so that every `roleAtLeast(role, STAFF)` call site still excludes DOOR. A unit test asserting `roleAtLeast(DOOR, STAFF) === false` and `roleAtLeast(DOOR, READ_ONLY) === true` should land with the change. This is the highest-risk part of the migration: a renumbering bug could silently widen or narrow an unrelated guard. Prefer explicit ranks over implicit ordering.
- **Team UI.** The Team settings UI that edits `WorkspaceMember.role` would need DOOR added to its role picker, with copy that maps the enum to a display string (never expose `DOOR` raw, per the Canonical Terminology rule). Suggested display label: "Door Staff" or "Check-In Staff."
- **Test coverage to add (currently absent).** Per Finding 3, there is no e2e check-in test and no `mintCheckInSession` unit test. The workstream should add: a unit test for the new rank ordering, a unit test for `mintCheckInSession` returning a token for DOOR and null for READ_ONLY, and ideally a Playwright spec that exercises the scanner page mint -> guest list -> check-in POST for a DOOR user. Building the role without these leaves the new boundary unverified.

### Summary of the proposal in one line

Add a `DOOR` enum value below STAFF, lower the `mintCheckInSession` floor to DOOR, and rely on the existing STAFF+ guards to keep door staff out of everything else. The check-in routes need zero changes because the token is the credential and the role decision already lives at a single mint chokepoint.

---

## UNDEFINED / unverified behaviors flagged

1. **Valid-but-unsynced QR reads as `not_found`.** Matching is local-only (`CheckInClient.tsx:165`); an RSVP created after the last list sync, or an event whose list never cached, shows a real guest as "QR not on guest list" with no server fallback.
2. **The `'error'` scan status is effectively dead code.** `ScanResult.status: 'error'` renders "Check-in failed — use search" (`CheckInClient.tsx:446-448`) but `handleQrScan` never sets it on the QR path; the error toast is unreachable for scanning.
3. **No malformed-QR validation.** Any decoded string is compared to `memberQrCode`; a non-NoBC or garbage QR is silently treated as `not_found` with the raw text echoed, with no distinct handling.
4. **Multi-device double-scan count drift.** The same QR scanned on two devices within the offline window passes the cache guard on both; the server's idempotent branch keeps DB writes correct, but the two devices' on-screen counts can transiently disagree until re-sync. Data-safe, but not explicitly reconciled in the client.
5. **End-to-end usage is UNKNOWN from code.** Only the token primitive is unit-tested (`tests/unit/check-in-token.test.ts`); there is no e2e/Playwright scanner spec, no `mintCheckInSession` test, and seed scripts set `checkedIn` directly in the DB rather than through the scanner.
6. **MCP `nobc_check_in` carries no explicit `minRole`.** `lib/mcp/tools/checkin.ts:54-59` marks the tool `destructive: true` but omits `minRole`; its effective role floor on the MCP surface is ambiguous in code and should be confirmed if the proposed DOOR tier is meant to reach MCP.
