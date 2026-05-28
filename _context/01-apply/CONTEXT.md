# Stage 01 — Apply

> Membership application form, AI archetype scoring, and reveal screen.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped — live at `/apply` |
| **V1 item** | #1, #5 |
| **Last updated** | 2026-05-21 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Backlog: reconcile the three competing answer-key generations (see Known issues). No structural form changes. (2026-05-21: demo seed rewritten to emit the live form's real dotted keys; one-time archetypeScores 0–1 → 0–100 migration done.) |

## Scope

This stage owns everything from the moment a person lands on `/apply` to the moment their `Application` row is written with archetype + personalized copy. It does **not** own approval workflow (that's `02-approval`).

## Files in play

```
app/apply/page.tsx                              ← server wrapper with Suspense
app/apply/_components/MembershipForm.tsx        ← 8-screen client form (~990 lines)
app/apply/_components/FroggerGame.tsx           ← South Congress easter egg
app/api/apply/membership/route.ts               ← POST: create draft Application
app/api/apply/membership/[id]/route.ts          ← GET + PATCH: read/update draft
app/api/apply/membership/[id]/submit/route.ts   ← POST: dual Claude calls
app/api/apply/membership/upload/route.ts        ← photo upload to Vercel Blob
config/archetypes.ts                            ← ALL archetype copy lives here
lib/scoring.ts                                  ← Member Worth axes + threshold logic
scripts/fix-archetype-scores-scale.ts           ← one-time backfill: archetypeScores 0–1 → 0–100 (run 2026-05-21)
```

## Schema models owned

- **Application** (form data + scoring outputs), **ApplicationAnswer** (per-question payloads, including the `_photos` system key)
- **ApplicationTemplate** (form variant definitions)
- **QuestionDefinition** (the canonical question library — APPLY_QUESTIONS lives here when surfaced via DB)

## Inputs

- Public visitor (no auth required)
- Optional `?id=xxx` query param to resume a draft

## Outputs

- `Application` row with: 8 screens of data, `archetype`, `archetypeScores` (JSON), `personalizedCopy`, 3-axis worth scores, binary tags
- Photo URLs in Vercel Blob

## The 8 screens

1. **The Basics** — name, email, phone, city/neighborhood, where from originally, birthday, links, referrers (up to 3)
2. **Real Questions** — working on, obsessed with, what people call you about
3. **Your World** — most interesting people, time you connected two people, community loyalty
4. **Taste** — place that gets details right, whose taste you trust, what you recommend, splurge vs save
5. **Rapid Fire** — karaoke song, coffee table, busy during the day, sunday morning, social link, something most people don't know
6. **Photos** — 1 required up to 5, candid over headshot, food/accessibility field
7. **Legal** — full waiver, single checkbox to unlock submit
8. **Reveal** — archetype name + story, spectrum bars, tags, next event card, share buttons, Frogger easter egg

## The six archetypes

All copy lives in `config/archetypes.ts`. Each has: `name`, `dayStory`, `nightStory`, `oneLiner`, `tags`, `sponsorSegments`.

| Archetype | Energy | Sponsor Segments |
|---|---|---|
| Connector | Relationships as currency, thinks two steps ahead | Premium travel, members clubs, executive services |
| Host | Sets the table before anyone asks | Spirits, F&B, hospitality tech, home |
| Curator | Shares the one thing worth your time | Fashion, beauty, luxury goods, hotels |
| Builder | Ships things, blank page is just Tuesday | B2B SaaS, fintech, business banking |
| Maker | Made something this week, can't not | Creative tools, instruments, fashion |
| Patron | Opens doors quietly, doesn't need credit | Wealth mgmt, real estate, watches, automotive |

## AI scoring (sequential)

On submit:
1. **Scoring call** — Claude Sonnet reads all answers, returns archetype assignment + spectrum scores (0–100 per archetype). Stored in `Application.archetype` and `Application.archetypeScores`.
2. **Personalization call** — reads archetype + all answers, generates 2–3 sentences specific to this applicant. Stored in `Application.personalizedCopy`.

## Member Worth scoring (post-AI)

Three axes 1–10, stored in `Application`:

- **Influence** — social links + content questions + what people come to you for
- **Contribution** — connection/intro question + community loyalty
- **Activation** — rapid fire + sunday morning + karaoke

Total /30. Thresholds: **22+ Charter candidate**, **16–21 Standard**, **<16 waitlist**.

Auto-applied binary tags: `Founder`, `ContentCreator`, `HospitalityOperator`, `Investor`, `Press`, `B2BDecisionMaker`.

## Day/Night toggle

- Day: bg `#f9f7f2`, accent `#B22E21` (NBC Red)
- Night: bg `#1a1520`, accent `#7F77DD` (purple)
- Reveal screen toggles between `dayStory` and `nightStory`
- Badge: "your archetype" → "your archetype — after dark"

## Rules — DO NOT VIOLATE

1. **Do not simplify the form.** 8 screens, 30+ questions. The depth is the product.
2. **Do not modify legal copy without attorney review.** Screen 7 waiver is a draft pending legal sign-off.
3. **Never hardcode archetype text in components.** All copy lives in `config/archetypes.ts`. Edit there, never inline.
4. **Save/resume is required.** Draft saves to DB on every step advance. Never break this.
5. **No auth on `/apply`.** It's a public route.
6. **Photos go to Vercel Blob via `BLOB_READ_WRITE_TOKEN`.** Do not switch storage providers without migration plan.

## Easter egg: South Congress Frogger

Triggered by "still with us?" at bottom of reveal. Canvas game:
- Dark Austin night aesthetic
- "I love you so much" mural at top
- Storefronts: Guero's, Hopdoddy, Home Slice
- Vehicles: Tesla (red `#CC3333`), Waymo (blue `#3366BB` labeled WAYMO), Food trucks (TACOS)
- S Congress Ave labeled on median
- Death: "got got on soco."
- Win: "you made it. welcome to austin."

## Known issues / backlog

**Three competing answer-key generations** — needs a dedicated cleanup pass (backlog, do not fix piecemeal):

1. **Live form (authoritative):** `MembershipForm.tsx` writes dotted `section.field` keys to `ApplicationAnswer` — `basics.*`, `personality.*`, `community.*`, `taste.*`, `rapid.*`, `about.*`, `photos.*`. This is what a genuine `/apply` submission actually produces. The operator UI resolves labels for these via `lib/legacy-answer-labels.ts`.
2. **`lib/apply-config.ts` (drifted):** uses bare camelCase keys that **do not exist in the live form** — `greatEnergy`, `learnedThisYear`, `meetPeople`, `priorEvent`, `referrer2/3/4`, `food`, `accessibility`, `consentMembershipRead`, `consentPhotos`. It's still the source for the queue's answer ordering and some labels, so it silently no-ops on real submissions.
3. **`lib/question-key-map.ts` (legacy bridge):** maps canonical `QuestionDefinition.stableKey` values (`real_working_on`, `world_connected_people`, …) to the **older** `real.*` / `world.*` dotted keys — **not** the live form's current `personality.*` / `community.*` keys. So question-agnostic scoring pairs definitions against keys the live form no longer writes → a **latent coverage gap on real submissions**.

Net: three key vocabularies (`personality.*` live → `real.*` legacy → `real_working_on` canonical) describe overlapping questions, and nothing fully reconciles them. The demo seed (`lib/dev/demo-applications.ts`) now emits generation #1 (the real live-form keys) so demo data matches production, but the apply-config/question-key-map drift remains. **Flag: dedicated reconciliation pass before relying on question-agnostic scoring for live applicants.**

## What this stage does NOT own

- Approval workflow / welcome email → `02-approval/`
- Red List + duplicate handling on submit → `02-approval/`
- Operator review UI → `07-operator-dashboard/`
- Sending the welcome SMS → V1.5. (House Phone is owned by `14-house-phone/` + the external Railway service; the Runtype-based "House Phone trigger" in Stage 11 was scratched.)
