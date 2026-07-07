# Stage 07 — Operator Dashboard

> The operator-facing surface: shell, navigation, member directory, audit log viewer. Individual feature dashboards (applications, events, RSVPs, payments) are owned by their respective stages.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped (UI) / ✅ RBAC (#28) — every `/api/operator/*` write gated (STAFF; refunds/settings/team ADMIN), plus `/api/agent/*` + `/api/intelligence/{compose,reports}` POST (STAFF, 2026-05-26); only the `/api/mcp` write path remains deferred. A Clerk-org role floor (`getEffectiveRole`) keeps org admins from being locked out. |
| **V1 item** | #20 (audit_events portion), #22 (theme system — now 12 themes; Darkroom added 2026-06-09, branch `back-room`), #24 (operator bulk delete), #28 (roles & permissions — base shipped 2026-05-25 PR #5; see "Update 2026-05-25" below) |
| **Last updated** | 2026-07-07 |
| **Owner** | Adam |
| **Blocked on** | Nothing hard. RBAC gates every `/api/operator/*` write (STAFF; refunds/settings/team ADMIN), the operator RSVP-bypass branch in `/api/m/.../access/*` (STAFF), `/api/stripe/refund` (ADMIN), and now `/api/agent/*` + `/api/intelligence/{compose,reports}` POST (STAFF, 2026-05-26). A Clerk-org floor (`getEffectiveRole`) means a Clerk org admin with no `WorkspaceMember` row is treated as ADMIN (never locked out). Remaining (deferred): only the `/api/mcp` write path (Bearer-authed — needs its own design). `/api/check-in/*` is intentionally excluded (`CHECKIN_SECRET` bearer, not a Clerk session). |
| **Next** | **2026-07-07: operator-surface gap closure (branch `fix/operator-gap-closure`, NOT merged — 14 commits, from the 2026-07-06 full operator-surface audit).** Audit log: entity-name resolution was dead code (lowercase matching vs uppercase emitters) — fixed case-insensitive + event-title resolution, entityType label map (RSVP → Access), `rsvp.*` actions display as `access ›`. Members: roster fetch bounded (take 1000 + total, honest truncation subtitle); Unblock / Remove-from-Purple bulk affordances added (the Block confirm had promised a reversal path that didn't exist); bulk tag/untag now audit; Guest/Comp drawer-creates no longer optimistically prepend a row the roster excludes. Team: Clerk-org-admin rows badge **Managed in Clerk** with controls hidden, the API 409s honestly on no-op demote/remove (was: success reported, access unchanged, grant row even hard-deleted), remove confirms. Settings: model switcher was a placebo (`Workspace.aiModel` had zero runtime consumers) — replaced with a read-only two-tier policy display; dead switcher component + PATCH route + `lib/ai-models.ts` removed. Sponsors: dormant `[id]` GET/PATCH/DELETE API wired into the UI (inline edit + guarded delete + confirm), Add hidden for non-ADMIN (was a guaranteed 403 for STAFF), all sponsor writes now audit. `loading.tsx` skeletons added across DB-backed operator segments (root, members×2, media×2, sponsors, team, house-phone, check-in, stories; people/organizations left to Campaign 1). settings/lists remove now checks `res.ok` + confirms; settings/application + communications render an error state instead of an empty editor whose Save would wipe data. **Literal next: Adam reviews + merges `fix/operator-gap-closure`.** — Prior: **2026-07-03 (pre-cutover cleanup):** sidebar Settings pinned-to-bottom restored - the June-22 `html, body { overflow-x: hidden }` mobile rule had made body a scroll container and silently broken `position: sticky` in the rail (Settings floated mid-rail on long pages); fixed to `overflow-x: clip` in `globals.css` (clips without creating a scroll container; mobile no-sideways-scroll verified at 390px). Same commit: site-wide OG share cards + NoBC favicon.ico (was the Create-Next-App Vercel default) - `og-default.png`/`og-apply.png` are FUNCTIONAL PLACEHOLDERS pending final art from Chloe. **2026-06-11 (branch `back-room`, pushed for review):** review/merge The Back Room easter egg + Darkroom theme + Last Call door game — type "knockknock" (desktop) or knock tap-tap·pause·tap-tap on the page (touch) for the speakeasy cinematic; the matchbook on the card opens Last Call (swipe-to-decide door game, 18 procedural guests, localStorage high score only); "Kill the lights" swaps to Darkroom (also in Cmd+K + Appearance with an Egg badge). Client-only; no network, no data access, all guests procedurally faked. Then: only the `/api/mcp` write path remains ungated (Bearer-authed external clients — design a dedicated check before applying a gate; `/api/agent/*` and `/api/intelligence/{compose,reports}` were gated STAFF on 2026-05-26). (Add Member create is now `requireRole(STAFF)` and its button is hidden for READ_ONLY via `MembersView canAddMembers`; the GUEST-filtered-from-directory note still stands — `GET /api/operator/members` excludes `status: GUEST`.) Optionally trim the now-unused birthdays/throwbacks fetch from `page.tsx`. (Audit 2026-05-21: the only "Open The Room" entry on this dashboard is gated to today-only events (`page.tsx:170`) — see Audit findings below.) **2026-05-27, PR #34:** all 8 operator data pages standardized to full width — Events, Applications, Members, Activity (the four list/table pages) + Event detail, Application detail, Member detail, New Event (the four detail/form pages) — dropped their `mx-auto max-w-[…]` content caps (→ `w-full`) and adopted the dashboard's `px-6 sm:px-10 lg:px-14 xl:px-20` gutters. **Settings/forms pages intentionally keep their narrow caps — these are by design, not bugs.** (Events/Applications pages render here but are owned by stages 03/02 — convention recorded here as the operator-shell owner.) **2026-05-27, PR #33:** Settings now has a **Developer** section that links to the DevToolbar (`OpenDevToolbarButton`, dev-gated by `DEV_USER_IDS`) — see Stage 13. **2026-05-28, nav simplification:** sidebar trimmed 12 → 7 (Dashboard, Events, Applications, Members, House Phone, Media, Intelligence) + Settings footer. Removed from rail: Check-in (per-event entry via `EventActionBar` is the door), Team + Lists (already surfaced as Settings cards), Sponsors (now a tab inside Intelligence — Community / Sponsors — Sponsors tab hidden for non-ADMIN), Activity (already rendered as the dashboard's `folio 03` "Recent activity" widget; link relabeled "Full log →" → "View all →"). Preview Site + Apply Form + `UserButton` moved out of the sidebar into a non-sticky inline utility strip at the top-right of `<main>` in `layout.tsx`. Compact-sidebar wordmark fixed `NBC` → `NoBC` (root CLAUDE.md naming rule). `OperatorNav`'s `isAdmin` prop is now unused (no more `adminOnly` items) but kept on the signature — `IntelligenceTabs` owns the Sponsors-tab hide via its own `isAdmin` prop resolved server-side from `lib/operator-role.ts:isAdmin`. |

## Scope

The operator UI shell and cross-feature surfaces:
- `/operator` shell + side navigation
- Member directory + member detail
- Audit log viewer (read-only)
- Workspace settings (theme, branding, integrations)
- Operator user management (invite, role)
- WCAG 2.2 AA compliance audit (cross-cutting but ownership lives here)

Feature-specific operator UIs (applications review, event editor, RSVP manager, refund button) are owned by the relevant stage but **render inside this shell**.

## Files in play

```
app/operator/layout.tsx                                  ← shell + nav + utility strip (Preview Site / Apply Form / UserButton, top-right inline in <main>); resolves operatorIsAdmin
app/operator/operator-nav.tsx                            ← sidebar nav: 7 primary items + Settings footer (Dashboard, Events, Applications, Members, House Phone, Media, Intelligence); compact wordmark "NoBC"; isAdmin prop currently unused
app/operator/page.tsx                                    ← editorial dashboard home (masthead → numerals → tonight → upcoming + Recent activity widget with "View all →" → /operator/audit)
app/operator/intelligence/_components/IntelligenceTabs.tsx ← (client) Community / Sponsors tab shell; Sponsors tab rendered only when isAdmin
app/operator/intelligence/page.tsx                       ← Community tab content; wrapped in IntelligenceTabs (isAdmin resolved via lib/operator-role.ts)
app/operator/intelligence/sponsor/page.tsx               ← Sponsors tab content; wrapped in IntelligenceTabs; requireRolePage(ADMIN)
app/operator/members/page.tsx                            ← directory
app/operator/members/[id]/page.tsx                       ← member detail
app/operator/members/_components/AddMemberDrawer.tsx     ← Add Member slide-over (manual create) — PR #4 merged
app/operator/members/_components/MembersView.tsx         ← directory shell w/ optimistic insert + toast — PR #4 merged
app/api/operator/members/create/route.ts                 ← POST manual member create + duplicate-email check — requireRole(STAFF) (PR #4 merged; gated 2026-05-25)
app/operator/team/page.tsx                               ← Team settings (operators + roles) — gated requireRolePage(ADMIN)
app/operator/team/_components/TeamManager.tsx            ← team roster + role assignment UI
app/api/operator/team/route.ts                           ← list/invite WorkspaceMember — requireRole(ADMIN)
app/api/operator/team/[id]/route.ts                      ← update/remove WorkspaceMember role — requireRole(ADMIN)
app/operator/audit/page.tsx                              ← audit log viewer
app/operator/settings/                                   ← workspace settings (entire directory; routes gated requireRole)
app/operator/_help/                                      ← in-app help / onboarding (entire directory)
app/operator/_components/dashboard/GlassPanel.tsx        ← frosted-glass primitive (.op-glass / .op-glass-strong); the reusable panel material
app/operator/_components/dashboard/StatFigure.tsx        ← asymmetric stat figure (lead | sm | wide); composes GlassPanel + CountUp
app/operator/_components/dashboard/CountUp.tsx           ← (client) numeral that counts up on load; reduced-motion → final value
app/operator/_components/dashboard/DeskClock.tsx         ← (client) masthead live HH·MM clock + contextual sub
app/operator/_components/dashboard/LiquidAmbient.tsx     ← faint drifting warm-wash blobs behind the page (decorative)
app/operator/_components/dashboard/SectionHeader.tsx     ← seclabel: --primary icon + tracked title + hairline + optional action
app/operator/_components/dashboard/CapacityBar.tsx       ← (client) 3px capacity track, --primary fill, animates width on mount
app/operator/_components/dashboard/ActivityRow.tsx       ← activity-feed row: colored tick + bold label + relative time
app/operator/_components/dashboard/TonightPanel.tsx      ← glass "Tonight" band: a gig per event today, ink "The Room" button
app/operator/_components/dashboard/format.ts             ← shared date/action formatters; actionColor → theme tokens
_context/07-operator-dashboard/glass-reference.html      ← the liquid-editorial (default) visual target (mockup)
_context/07-operator-dashboard/riso-reference.html       ← the editorial/riso-print visual target (mockup)
lib/theme.ts                                             ← active theme resolution (12-theme system, incl. editorial + darkroom + per-workspace override)
app/operator/_components/BackRoomEasterEgg.tsx           ← The Back Room easter egg: typed + touch knock triggers, door cinematic, WebAudio lo-fi engine, Darkroom swap, matchbook → Last Call (client-only; honors prefers-reduced-motion)
app/operator/_components/LastCallGame.tsx                ← Last Call door game: swipe/arrow decisions, 3 rounds + Red List, procedural guests only (no real data), localStorage best score
lib/commands/theme/switch-darkroom.ts                    ← Cmd+K "Switch to Darkroom"
lib/operator-role.ts                                     ← RBAC (PR #5): OperatorRole hierarchy + getOperatorRole / isAdmin / isStaff / requireRole / requireRolePage. (Replaced the never-built `lib/permissions.ts` name from the 05-21 audit.)
lib/auth.ts                                              ← getOrCreateWorkspaceForUser / requireWorkspaceId / getMemberWorkspaceId — resolves workspace from Clerk org membership; role now comes from lib/operator-role.ts (WorkspaceMember row)
lib/audit.ts                                             ← (planned, not yet built) — AuditEvent writes currently happen inline at each operator route; consolidate when the surface stabilizes
app/globals.css                                          ← glass tokens (.operator-scope), .op-glass material, .op-btn, .op-ambient + drift, .op-rise entrance (all honor prefers-reduced-motion)
```

Replaced in this redesign: `StatColumn.tsx` → `StatFigure.tsx`. The `.editorial-fade-in`/`.editorial-stagger-*` CSS was removed in favor of `.op-rise` + the glass material.

## Inputs

- Operator user (authenticated via Clerk, scoped to workspace)
- `AuditEvent` rows written by every other stage
- `Member`, `Application`, `Event`, `RSVP` rows for directory views

## Outputs

- Operator UI renders
- `AuditEvent` rows for operator-initiated actions in this stage (member edits, settings changes, team invites)

## Schema models

- **Workspace**: the tenant root. Cross-cutting — `workspaceId` lives on every other user-data table. Read/write from any stage; canonical owner is this one.
- **Member**: the approved-applicant record. Created by Stage 02 at approval time, lives in the operator directory here, referenced by Stages 03/04/05/06/11/12.
- **AuditEvent**: workspaceId, actorType (`OPERATOR | MEMBER | SYSTEM | AGENT`), actorId, action, resourceType, resourceId, metadata (JSON), createdAt
- **PlatformSetting**: workspace-scoped key/value settings (theme, branding, feature flags)
- **OperatorComment**: per-resource notes (on an Application, Member, Event, etc.)
- **OperatorNotification**: in-app notifications surfaced in the operator shell
- **Tag** + **EntityTag**: member/application tagging surface used in the directory
- **AccessToken**: operator API tokens (when present)
- Indexes: (workspaceId, createdAt DESC), (resourceType, resourceId)

## Dashboard home — liquid editorial (DEFAULT look)

The operator home (`app/operator/page.tsx`) is editorial typography on translucent frosted-glass panels over a calm, faintly drifting warm wash. Visual target: `glass-reference.html` in this folder. The contract:

- **Full-bleed, asymmetric magazine grid** — NOT a centered column. Section order: masthead → four figures (asymmetric) → Tonight band → Upcoming events + Recent activity (asymmetric lower grid).
- **Masthead:** dateline ("The operator's desk · {date}", date in `--primary`) → large serif headline with the period in `--primary` → italic serif standfirst. A live `DeskClock` sits at the right.
- **Figures grid** (`1.5fr 1fr`, two rows — morning brief, not a live event board): **Pending applications** is the dominant tall `--glass-strong` panel with a **red** count-up numeral, avatar faces, and the red "Review the queue" pill — this is the single dominant red moment. Members + Upcoming are the two small figures stacked beside it. (The "Checked in today" figure + its `db.rSVP` query were removed in the IA polish pass — live check-in lives in The Room.)
- **One accent moment.** Red = the lead figure (numeral + pill). Everywhere else red is punctuation-scale only (the headline period, the dateline date, 3px capacity fills, 7px activity ticks, section icons, "Tonight" eyebrows). **Primary CTA buttons are ink (`.op-btn-primary`), never red.**
- **Glass material — token-driven.** Use `GlassPanel` / `.op-glass` (or `.op-glass-strong`). The material reads only theme tokens: `--glass`, `--glass-strong`, `--glass-edge`, `--glass-highlight`, `--glass-shadow`, `--glass-sheen`. These are defined on `.operator-scope` via `color-mix` on the live `--surface`, so they retheme automatically; dark themes (midnight/obsidian/void/ember) get denser glass + faint light edges + a real drop shadow; high-chroma themes (y2k/aim/myspace) get near-opaque glass for legibility. **Readability is the gate** — if a theme's `--glass` ever drops text below AA, raise its opacity.
- **Ambient stays quiet.** `--ambient-1/2/3` tint three blurred `.op-blob`s at ~0.14 opacity (the "liquid" feeling comes from the glass + motion, not loud clouds).
- **Display font everywhere large.** All numerals, headline, event titles, gig titles use `var(--font-display)` directly so per-theme pairings inherit (Obsidian → Cormorant, Parchment → Fraunces, etc.). Never hardcode a family name.
- **Motion (all gated by `prefers-reduced-motion`):** numerals count up (`CountUp`), capacity bars grow on mount (`CapacityBar`), sections rise in staggered (`.op-rise` + inline `animation-delay`), glass panels lift + sheen-sweep on hover, ambient drifts continuously.
- **Reusable dashboard components live under `app/operator/_components/dashboard/`** — extracting from `page.tsx` (rather than inline JSX) is the default when adding an editorial surface here.

> Data note: `page.tsx`'s `Promise.all` is unchanged (byte-identical). It still fetches birthdays/throwbacks (last two results) which the liquid layout no longer renders — trim later if desired.

## Dashboard home — editorial / riso mode (11th theme)

Selecting the **Editorial** theme (`data-theme="editorial"`, the 11th theme in `lib/theme.ts` + the Appearance picker) transforms the *same* dashboard into a printed daily broadsheet. Visual target: `riso-reference.html`. The transform is **pure CSS** — no component branching, no JS theme logic — driven entirely by the editorial token block + `[data-theme="editorial"] .operator-scope` overrides in `globals.css`:

- **Flat print, not glass.** `.op-glass` / `.op-glass-strong` lose backdrop-filter, shadow depth, hover lift, and sheen; they become solid `--surface` cards with a 1px solid `--text-primary` ink rule and square corners. The `LiquidAmbient` blobs are `display:none`.
- **Nameplate** — a `.op-nameplate` strip (rendered in `page.tsx`, hidden in every other theme) reveals at the top: inked bar, mono uppercase "Edition №47" / "No Bad Company · Austin, TX" / date.
- **Folios** — `SectionHeader`'s `folio` prop ("01"/"02"/"03") shows a mono section number before each label (`.op-folio`, hidden elsewhere).
- **Inverted lead** — the Pending figure (`.op-fig-lead`) inverts: ink panel, paper text (semantic `--text-*` re-pointed to paper inside the panel), brightened poster-red numeral (`--lead-red`, lifted for AA on ink).
- **Film grain** — a fixed `.operator-scope::before` SVG fractal-noise overlay at 3% / `mix-blend-mode: multiply`.
- **Crisp motion** — `CountUp` ramps in 900ms when editorial is active; blob drift is off; the `.op-rise` entrance stagger stays.
- **Tokens:** `--bg` warm cream `#EFE9DA`, `--surface` warmer cream, `--text-primary` warm ink `#1A1813`, `--primary` NoBC Red, glass tokens flattened to opaque. `--font-mono` (JetBrains/Fira/system stack) is defined on every theme block for the mono print labels.

## Rules — DO NOT VIOLATE

1. **All operator routes require Clerk auth.** Middleware enforces — every page under `/operator/*` redirects to sign-in if unauthed.
2. **Workspace boundary is absolute.** An operator in workspace A cannot see workspace B's data, period. Every query filters on `workspaceId`.
3. **Every operator action writes an `AuditEvent`.** Member edit, settings change, team invite — all logged.
4. **WCAG 2.2 AA is the bar.** Use Radix UI primitives. No custom interactive elements without accessibility audit.
5. **No hex literals.** Operator dashboard uses CSS variables so white-label theming works per-tenant.
6. **Audit log is read-only.** No edit, no delete. Even by admins.

## Audit findings — "The Room" entry gate (2026-05-21, code-verified, read-only)

"The Room" is the per-event live check-in board. **The button does not appear on the demo dashboard because the only dashboard entry point is gated to today-only events.**

- The "Tonight" band (`app/operator/_components/dashboard/TonightPanel.tsx:58`) renders the **"Open The Room"** link, but `TonightPanel` returns `null` when its `events[]` is empty (`:23`).
- That array comes from `app/operator/page.tsx:170`: `db.event.findMany({ where: { workspaceId, status:'PUBLISHED', startAt: { gte: startOfToday, lte: endOfToday } } })` (`startOfToday`/`endOfToday` defined `:18-27`). **Strictly today only.**
- Both demo seeds create events that are strictly past or strictly future — none start *today* — so `todaysEvents` is empty → no button. (Details + smallest fix in `13-dev-tooling`.)
- **Second, always-available entry point:** the event-detail action bar `app/operator/events/[id]/_components/EventActionBar.tsx:53-59` ("The Room →"), ungated by date. This is the fastest way to reach The Room for QA today — open any event with checked-in RSVPs and click it.
- The Room route/query itself (`app/api/operator/events/[id]/room/route.ts`, `RoomDashboard.tsx`) is owned by `06-wallet-checkin` (it's the live check-in board). The member directory on *this* stage rebuilds applicant↔member identity by **lowercased-email join** (`app/api/operator/members/route.ts:44-58`), not by FK — see the contact-model map in `02-approval`.

## Update 2026-05-25 — RBAC base shipped (PR #5)

The 05-21 audit below documented a *fully unenforced* RBAC gap. PR #5 closed the base of it; the audit stays for context but the current state is:

- **Roles exist in code.** `OperatorRole` enum (**ADMIN > STAFF > READ_ONLY**) on `WorkspaceMember.role` (default STAFF). Helpers in `lib/operator-role.ts`: `requireRole(minRole)` (route → 401/403), `requireRolePage(minRole)` (page → redirect), `getOperatorRole` / `isAdmin` / `isStaff`. A resolved org member with no `WorkspaceMember` row is treated as **READ_ONLY** (floor). Adam + Chloe seeded ADMIN.
- **Gated today:** `/api/operator/settings/*`, `/api/operator/team*`, `/api/operator/members/bulk`, `/api/sms/*` (House Phone), plus the `/operator/settings` + `/operator/team` pages.
- **Still ungated (auth + workspace only):** the approve/reject/refund/comp/bulk-delete mutation routes, `/api/intelligence/*`, `/api/agent/*`, and the `/api/mcp` write path. Extending `requireRole` to these is the remaining RBAC work — and it supersedes the "five roles" model in the 05-21 table below (shipped model is the three roles above).

## Update 2026-05-25 (later) — route-coverage audit + extension

Route-protection audit closed the operator-route half of the gap above. Every `/api/operator/*` **write** handler (POST/PUT/PATCH/DELETE) now calls `requireRole`:

- **STAFF** (the operational floor — READ_ONLY may only GET): applications approve/reject/hold/waitlist + bulk, rsvps approve/reject/cancel, events create/edit/comp/promote-waitlist/bulk-delete, comments, lists, notifications, series (+generate), ticket-tiers, tiers (+reorder/seed), and **Add Member** (`members/create`).
- **ADMIN** (sensitive): refunds (`rsvps/[id]/refund` **and** `/api/stripe/refund`), plus the already-gated member bulk/Red-List, team/role changes, and workspace settings.
- **Cross-cutting (not under `/api/operator`):** the operator **RSVP-bypass** branch inside `/api/m/events/[slug]/access/{submit,payment-intent}` is now STAFF-gated (the `isOperator` signal requires `isStaff`, so a READ_ONLY org member can no longer mint a preview/comp RSVP). The **Sponsor Intelligence** page (`/operator/intelligence/sponsor`) is `requireRolePage(ADMIN)`, and its nav entry ("Sponsors") is hidden for non-ADMIN (`OperatorNav isAdmin`).
- **Intentionally excluded:** `/api/check-in/*` authenticates via a `CHECKIN_SECRET` bearer token (offline check-in PWA, #12), not a Clerk session — `requireRole` would break door check-in and is inapplicable. Its own token boundary stands.
- **GET handlers left open** to READ_ONLY by design ("READ_ONLY: GET routes only").
- **Still deferred** (next RBAC step): `/api/agent/*`, the `/api/mcp` write path, and `/api/intelligence/*` mutation routes.

---

## Audit findings — authorization gap / unenforced RBAC (2026-05-21, code-verified, read-only)

> Superseded in part by "Update 2026-05-25" above — roles now exist; the route-coverage gap is what remains.

**VERDICT: a CONTAINED internal gap today — NOT a member-facing data leak / hard launch blocker — but it becomes launch-blocking the moment any non-owner operator (staff / readonly) is onboarded, and the control that contains it is fragile and implicit.**

### Q1 — The linchpin: do members share the operators' workspace/Clerk org? NO (today, by accident not design)
- Both members and operators resolve `workspaceId` through the **same** function — `getOrCreateWorkspaceForUser` (`lib/auth.ts:4`) — which derives the workspace from `memberships.data[0].organization` (`:12`), the user's first **Clerk Organization** membership. It reads **no role**.
- Operators differ from members only in that operators are provisioned into the NoBC Clerk org **out-of-band** (Clerk dashboard). **No code anywhere adds a member to a Clerk org, creates an org, or sets role metadata** — verified: zero hits for `createOrganization` / `organizationMembership` / `publicMetadata` / `has({…})` across `app/` + `lib/`.
- So a regular club member has **no** Clerk org → `requireWorkspaceId(memberUserId)` **throws** (`lib/auth.ts:8-9`) and `getMemberWorkspaceId` returns `null` (`:47`). A plain member hitting an operator API does **not** resolve into the operators' workspace — they error out / get the member gate. **Members and operators are the same Clerk user pool with one ClerkProvider; the only wall is "do you have an org membership," enforced solely by the absence of member-org-provisioning code.**

### Q2 — What gates operator routes: authentication + workspace-scoping ONLY, never role
- `middleware.ts:3-13`: `auth.protect()` on page prefixes `/m`, `/operator`, `/check-in`, `/qa-panel` = **logged-in only**. `/api/operator/*`, `/api/intelligence/*`, `/api/mcp`, `/api/agent/*` are **not** in the protected matcher — they rely on each handler's own `if (!userId) return 401` + `requireWorkspaceId`.
- `app/operator/layout.tsx:22-23`: `getMemberWorkspaceId(userId) ?? ''` — **no role check**; a logged-in no-org user renders the operator shell with empty data (no redirect).
- Every operator API is the uniform shape `auth() → 401-if-anon → requireWorkspaceId(userId) → real work`. None imports a permissions module (none exists).

### Q3 — Exposure
- **Regular member (no org):** operator pages render an empty shell; operator/intelligence APIs throw on `requireWorkspaceId` → error, **no data**. No PII / applications / Red List / intelligence / audit leak to members.
- **Any user IN the operators' Clerk org (i.e., any operator regardless of intended role):** full read **and** write — member PII, applications + AI scores, intelligence, audit log, plus approve/reject/refund/comp/bulk-delete/AI-agent. The only 403s in the codebase are cross-**workspace** resource access and dev-tooling env-allowlist (`DEV_USER_IDS`) — **never** an under-privileged role.

### Q4 — Roles: documented, not built
- No role enum/field in `prisma/schema.prisma` (Member `:111-143` has `status MemberStatus`, no `role`). `lib/permissions.ts` **does not exist**. The strings owner/admin/manager/staff/readonly appear nowhere as role values.
- The only Clerk role ever read is `m.role` at `app/api/operator/operators/route.ts:29` — returned for @-mention display, **never used in a guard**.
- Reconciliation vs root CLAUDE.md "Roles & Permissions":

  | CLAUDE.md claim | Reality |
  |---|---|
  | Five operator roles exist | **FALSE** — no role enum/constant anywhere |
  | Permissions enforced at API layer / "403 on failure" | **FALSE** — auth + workspace only; role never examined |
  | Every permission check writes an AuditEvent | **N/A** — no permission checks exist (AuditEvents fire on business mutations, not authz decisions) |

  This matches CLAUDE.md's own contradicting note: *"any workspace member can currently hit any route."* That note is the accurate one.

### Q5 — Route → gate map (operator-only surfaces)

| Surface | Middleware | Per-route role guard | Workspace-scoped |
|---|---|---|---|
| `/operator/*` pages incl. `/operator/audit`, `/operator/intelligence` | auth-only | **None** | layout/page only |
| `/api/operator/*` (members, applications + [id]/approve\|reject\|hold\|waitlist, events, rsvps/[id]/approve\|reject\|refund, comp, bulk-delete, settings, lists, comments, series, notifications) | not matched → in-handler 401 | **None** (403 only cross-workspace) | Yes |
| `/api/intelligence/compose`, `/api/intelligence/reports` | not matched → in-handler 401 | **None** | Yes |
| `/api/agent/*` (run, confirm, cancel) | not matched → in-handler 401 | **None** | Yes |
| `/api/mcp` (MCP server, all write tools) | not matched → in-handler 401 (Clerk bearer/session) | **None** | Yes (from identity) |
| `/api/operator/operators` | in-handler 401 | reads `m.role` for **display only** | via Clerk `orgId` |

### Smallest correct fix (NOT implemented — outline only)
1. Add one server-side authz helper (the missing `lib/permissions.ts` + e.g. `requireOperator(userId)` / `requirePermission(userId, action)`) that resolves the workspace **and** asserts the caller's Clerk **org role** (`auth().orgRole` / `has({ role })` — already available; `operators/route.ts:29` proves the data is present). **Deny by default.**
2. Map Clerk org roles → the five documented roles + an action matrix (owner/admin = full; manager = approve/publish/comp; staff = check-in only; readonly = GET only).
3. Call it at the top of every `/api/operator/*`, `/api/intelligence/*`, `/api/agent/*`, the `/api/mcp` write path, and the `/operator` layout — replacing the bare `requireWorkspaceId` where a privileged action is performed. Coarse first cut: require *any* recognized operator role for all operator routes (closes intra-tenant escalation immediately); refine per-action next.
4. Emit an AuditEvent on denials (satisfies the CLAUDE.md "audit every permission check" claim).
5. Defense-in-depth, outside code: confirm Clerk dashboard disables "users can create organizations" / auto-personal-org, so org membership only ever comes from an explicit operator invite — and never treat "has any org membership" as sufficient authority.

## What this stage does NOT own

- Application review UI → `02-approval/`
- Event editor → `03-events/`
- Access (RSVP) manager → `04-access/`
- Refund button + payment ops → `05-payments/`
- Check-in dashboard + The Room route/query → `06-wallet-checkin/`
- MCP tool authorization (same gap, server-side) → `08-mcp-server/`
- Intelligence API authorization (same gap) → `12-intelligence/`
- AI chat panel → `09-ai-chat/`
