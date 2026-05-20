# NoBC OS — Status

_Last updated: 2026-05-19_

## Current branch: `main`

## Last 5 commits
- `fix(validation)` zod schemas, length caps, phone normalization, inline client validation
- `docs(status)` refresh after 5-block session
- `feat(events)` hero images, live RSVP list, member event redesign
- `feat(help)` operator + member help systems with tooltips
- `feat(member)` complete member portal — home, rsvps, profile

## In flight
Theme + help + delight pass. Uncommitted. `tsc --noEmit` clean.

## What shipped this session (uncommitted)

**Theme contrast audit** — all 10 themes (`nobc`, `midnight`, `obsidian`, `rose`, `parchment`, `void`, `ember`, `y2k`, `aim`, `myspace`) now hit WCAG 2.1 AA (4.5:1) on body/secondary/tertiary text, button text on primary, and all status chip pairs. Override block appended to `app/globals.css` — 110/110 verified pairs pass.

**Help content rewrite**
- `app/operator/_help/content.ts` — 8 sections rewritten in NoBC voice (direct, lowercase casual, members not users, "the way we think about it" anchors).
- `app/m/(portal)/help/page.tsx` — DEFAULT_FAQ sharpened (6 entries). PlatformSetting `help.member.faq` integration already existed.

**Delight pass**
- `MemberConstellation` (SVG, no lib) at top of `/operator/intelligence`. Dots sized by aiScore, colored by archetype CSS vars, position hashed from member.id, parallax on mouse, lines between cosine-similar (>0.7) archetype profiles, hover tooltip, click → member detail.
- Dashboard widgets below Action Required: **Birthdays this week** (queries `ApplicationAnswer` for `basics.birthday`) and **On this day** (AuditEvent at 30/90/365 days ago). Both hide on empty data.
- `WaxSealStamp` component + `lib/sounds/wax-stamp.ts` — layered 80Hz sine thump + bandpass-filtered noise burst (~150ms), fires on mount with the existing parchment seal animation.

**Clerk appearance** — `lib/clerk-appearance.ts` passes a config matching NoBC tokens (cream bg, red primary, PP Editorial italic headings, Neue Haas body, 10px cards, 6px buttons). Wired into `<ClerkProvider>` in `app/layout.tsx`.

## Known gaps
- Birthday wall is wired but no `birthday` field on `Member` — depends on `basics.birthday` answer surviving on Application. Will surface for members whose application carried the answer.

## Blocked
- Apple/Google Wallet passes — PassNinja account pending.
- MCP server toolset incomplete.

## Next session
Commit, smoke-test in dev (each theme + constellation + birthday/throwback widgets + Clerk sign-in styling), then deploy.
