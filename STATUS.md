# NoBC OS — Status

_Last updated: 2026-05-19_

## Current branch: `feat/member-portal-and-lists`

## Last 5 commits
- `2354f51` docs: add README for external collaborator onboarding
- `5ddbf24` feat(apply): expand form to 9 screens with new question set
- `142ef88` feat(checkin): service worker, PWA install prompt, tier/payment in scan result
- `7326e3d` feat(rsvp): Items 8+9 — approval_required + Stripe authorize/capture
- `6eafe6b` feat(operator): nav restructure, settings landing + tabs, app preview links

## In flight
- Member portal: `/m/home`, `/m/profile`, `/m/rsvps`, `/m/application` — files written, tsc clean, **not yet committed**
- Member portal nav (`MemberPortalNav`) + `(portal)` layout
- API routes: `GET/PATCH /api/m/profile`, `GET /api/m/rsvps`
- Part 2 (WatchList schema + operator UI + duplicate detection) — **not yet started**

## Blocked
- Item 11 (Apple/Google Wallet passes) — PassNinja account pending
- Item 17 (MCP server) — toolset incomplete

## Next session should start with
Commit the member portal (Part 1), then build Part 2: add `WatchList` model to schema, run `prisma migrate dev`, build operator lists UI at `/operator/settings/lists`, wire duplicate + blocked + purple-list logic into apply submit route.
