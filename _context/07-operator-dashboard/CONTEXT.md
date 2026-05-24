# Stage 07 — Operator Dashboard

> The operator-facing surface: shell, navigation, member directory, audit log viewer. Individual feature dashboards (applications, events, RSVPs, payments) are owned by their respective stages.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #20 (audit_events portion), #22 (7-theme system), #24 (operator bulk delete), #28 (roles & permissions — Roles & Permissions section lives in root CLAUDE.md) |
| **Last updated** | 2026-05-24 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Manual member creation shipped (Add Member slide-over on the directory → `POST /api/operator/members/create`, duplicate-email checked, optimistic insert). Two follow-ups: (1) the create route is **unprotected** (auth + workspace only) pending the `lib/permissions.ts` RBAC work — see the `TODO(#28 RBAC)` in the route; (2) a GUEST created here shows optimistically but is filtered out of the directory on refresh, since `GET /api/operator/members` excludes `status: GUEST`. |

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
app/operator/layout.tsx                                  ← shell + nav
app/operator/page.tsx                                    ← editorial dashboard home (masthead → numerals → tonight → journal → marginalia)
app/operator/members/page.tsx                            ← directory (server: fetch → MembersView)
app/operator/members/_components/MembersView.tsx         ← (client) directory shell: optimistic list state + header Add Member action + success toast
app/operator/members/_components/AddMemberDrawer.tsx     ← (client) Add Member slide-over (DetailDrawer); manual create form
app/api/operator/members/create/route.ts                 ← POST manual member create (validation + duplicate-email check); unprotected pending RBAC
app/operator/members/[id]/page.tsx                       ← member detail
app/operator/audit/page.tsx                              ← audit log viewer
app/operator/settings/                                   ← workspace settings (entire directory)
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
lib/theme.ts                                             ← active theme resolution (11-theme system, incl. editorial + per-workspace override)
lib/permissions.ts                                       ← role → action matrix used by every operator API route
lib/audit.ts                                             ← AuditEvent write + query helpers (single module)
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

## What this stage does NOT own

- Application review UI → `02-approval/`
- Event editor → `03-events/`
- Access (RSVP) manager → `04-access/`
- Refund button + payment ops → `05-payments/`
- Check-in dashboard → `06-wallet-checkin/`
- AI chat panel → `09-ai-chat/`
