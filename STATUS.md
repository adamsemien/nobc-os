# NoBC OS — Status

_Last updated: 2026-05-19_

## Current branch: `feat/member-portal-and-lists`

## Last 5 commits
- `feat(lists)` WatchList schema, duplicate detection, blocked/purple auto-routing, operator UI
- `feat(portal)` member portal — /m/home, /m/profile, /m/rsvps, /m/application + nav + API routes
- `docs` rewrite STATUS.md lean + add Session Discipline rule to CLAUDE.md
- `docs` add README for external collaborator onboarding
- `feat(apply)` expand form to 9 screens with new question set

## In flight
- WatchList migration pending — needs DB reset. Run: `! PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="prisma migrate dev after schema change (demo data only, safe to reset)" node_modules/.bin/prisma migrate reset --force` then `npx prisma migrate dev --name add_watch_list`
- Prisma client regenerated (types clean), schema written — just needs migration applied to DB

## Blocked
- Item 11 (Apple/Google Wallet passes) — PassNinja account pending
- Item 17 (MCP server) — toolset incomplete

## Next session should start with
Apply the WatchList migration (see above command), then push `feat/member-portal-and-lists` → main.
