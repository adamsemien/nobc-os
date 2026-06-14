# Producer → Standard-Infra Migration Prep — Task Brief (for the Replit Agent)

> Paste-ready brief authored 2026-06-12. Hand this to the Replit Agent working in
> the Producer codebase. It prepares Producer to migrate off Replit onto standard
> infra (GitHub + Vercel + Neon, developed via Claude Code) and hardens the one
> live integration with the member-facing app, "NoBC OS."

---

You are working in the **Producer** codebase (the Replit app). Producer is the operator / back-of-house tool (vendor directory, run-of-show) for No Bad Company. It runs on Replit today with a Replit-managed Postgres and its own Clerk instance. We are preparing to migrate Producer's development off Replit onto standard infrastructure (GitHub + Vercel + Neon, developed via Claude Code) and to harden the one live integration it has with our member-facing app ("NoBC OS").

Do the tasks below **in priority order.**

**Ground rules — non-negotiable:**
- **Never commit or print secret values.** Env manifests list variable *names* + *purpose* only.
- **Do not delete data and do not run destructive DB migrations** (no DROP / TRUNCATE / `db push --accept-data-loss`). Inventory and document; don't rip out.
- Work on a branch; don't force-push `main`.

## P0 — Security + integration (do first)

**1. Lock down the CRM vendor export endpoint.**
- The endpoint `GET /api/crm-export/vendors` must resolve its workspace from the `PRODUCER_WORKSPACE_ID` env var and filter **every** query by that single `workspaceId`. Confirm `PRODUCER_WORKSPACE_ID` is set; if it is unset the query falls back to an arbitrary workspace and **leaks vendor PII across tenants** — that is a security bug, not a convenience fallback.
- Confirm the query targets `DirectoryCompany` with `{ roles: { has: "Vendor" }, deletedAt: null }`. There is **no `Vendor` table** — it was dropped in "Phase B."
- **Acceptance:** with `PRODUCER_WORKSPACE_ID` set, the endpoint returns only that workspace's vendors; with it unset, the endpoint **refuses** (does not silently fall back to an arbitrary workspace).

**2. Confirm the export endpoint's deploy + auth.**
- Confirm `/api/crm-export/vendors` is reachable in the **deployed** environment (not just dev) and that the HMAC verification in `lib/crm-export-auth.ts` is active (the partner app signs requests; a mismatched shared secret fails silently).
- Document the exact env-var **name** of the shared HMAC secret and the canonical string it signs.
- **Acceptance:** a correctly-signed request succeeds; an unsigned / wrong-signature request is rejected; the secret var name + canonical-string recipe are written down.

## P1 — Migration prep (safe regardless of the final hosting decision)

**3. Get the codebase onto GitHub.**
- Ensure the full Producer code is pushed to a GitHub repo with a clean `main` and a `.gitignore` that excludes Replit artifacts (`.replit`, `.replit-artifact/`, caches) and any secret files.
- **Acceptance:** the repo clones cleanly; the tree contains no secrets and no Replit-only files in source.

**4. Produce an env-var manifest (NAMES + PURPOSE ONLY — redact every value).**
- List every environment variable Producer reads (from Doppler + Replit Secrets): name, what it is for, whether it is a secret. **No values.**
- **Acceptance:** a `MIGRATION/env-manifest.md` listing all vars; zero secret values present.

**5. Export the DB schema + migration history; check for drift.**
- Export `schema.prisma` and the `prisma/migrations` folder. Run `prisma migrate status` and report whether the migration history matches the live database or whether out-of-band changes (raw SQL / `db push`) have drifted it.
- Note the current dev database name/host (name only — no credentials).
- **Acceptance:** schema + migrations exported; a one-paragraph drift report.

**6. Inventory Replit-specific coupling.**
- Identify everything that ties the app to Replit so it could run as a vanilla Next.js app (`npm run dev` with a standard `DATABASE_URL`): `.replit`, `.replit-artifact/artifact.toml` (route-prefix claims), Replit-managed-Postgres assumptions, any Replit-only middleware (e.g. a Clerk public-route bypass), and any Replit widget/runtime APIs.
- Produce a checklist of what must change to run off-Replit. **Inventory only — do not remove anything yet.**
- **Acceptance:** a `MIGRATION/replit-decoupling-checklist.md` listing each coupling + the change it needs.

**7. Document the integration seams with the partner app (NoBC OS).**
- Document: (a) the CRM vendor export contract (path, HMAC auth recipe, pagination, response shape); (b) any outbound event webhook Producer sends to NoBC OS (URL var name, signing); (c) the Airtable RSVP-count integration — which is being **retired** — note what reads/writes it.
- **Acceptance:** a `MIGRATION/integration-seams.md` capturing all three.

**8. Confirm production reality.**
- State plainly: does Producer have a **production** deployment and a **production** database today, or is it dev-stage only? (Note: it has no production Clerk environment.) If a prod DB exists, give its name/host (no credentials) and whether it holds real data that would need migrating.
- **Acceptance:** a one-paragraph "production status" statement.

## Deliverable — migration handoff doc

Consolidate the above into an expanded `replit.md` (or a new `MIGRATION/README.md`) so a developer picking this up in Claude Code can: run it locally, recreate the env, set up the DB, understand the integration seams, and see the decoupling checklist.

## What to hand back

A short summary: which tasks are done, paths to the manifests/docs you produced, and any blockers or decisions you need from the founder (Adam) — in particular anything that depends on whether Producer will be **converged into NoBC OS** vs kept as a **standalone app** (that decision is still open and affects whether Producer's data migrates into NoBC's database or its own).
