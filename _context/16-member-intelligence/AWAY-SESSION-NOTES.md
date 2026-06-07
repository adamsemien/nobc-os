# Away-Session Notes — Member Intelligence PR2 + PR3 foundation

_Autonomous session, 2026-06-06 → 06-07. Branch: `feat/member-intelligence`._

Picks-up-instantly summary for Adam. Everything below is committed unless explicitly marked **PARKED** or **YOU RUN**.

---

## Bottom line

- **PR2 is COMPLETE and green** (S1–S10 + provenance write-path + instagram dedup).
- **PR3 foundation landed** (read-path API + dependency-free data-access layer) — **no rendered UI**, per your instruction.
- **Test/build state:** `vitest` **140 passing / 0 failing**, `tsc --noEmit` **clean**, `next build` **Errors: 0** (22 pre-existing warnings).
- **2 writes left for YOU to run** (DB data backfills) + **1 dependency decision PARKED**. None block anything.

---

## Tooling gotcha you'll hit immediately

`npx prisma …` is **broken in this environment** — it resolves to a stale shim and dies with `[rtk: No such file or directory]`. Use the direct binary instead:

```
node node_modules/prisma/build/index.js <cmd>      # e.g. migrate diff / generate
DATABASE_URL="$DIRECT" node node_modules/prisma/build/index.js db execute --file <f>
```

`next build`/`next lint` route through a terse formatter that hides error detail (only prints `Errors: N`). To see the actual error, run ESLint directly: `npx eslint <files>`. (A build regression this session was a single `@typescript-eslint/no-explicit-any` — invisible in the build summary, obvious via eslint. Caught + fixed before commit.)

---

## Commits this session (oldest → newest)

| Commit | What |
|---|---|
| `fdee917` | PR2 S1–S7 — Member dimension columns + `MemberPsychographics` + `FieldDefinition` + enum (schema) |
| `51e6ec5` | PR2 S9 — sponsor firewall gate (type boundary + source-scan test) |
| `9440c25` | PR2 S10 — remediated the live archetype leak on the sponsor page |
| `c7aa869` | PR2 S8 — `sponsor_audience_member` firewall view (out-of-band SQL) |
| `966736c` | PR2 — provenance write-path (PATCH) + psychographics populate script |
| `430d5ef` | PR2 — lit up instagram dedup in `findMergeCandidates` |
| `064bc9a` | Route-level test coverage for the PATCH write-path |
| `313f440` | PR3 — read-path API (`GET …/record`, role-gated psychographics) |
| `0519628` | PR3 — dependency-free data-access layer (TanStack parked) |
| `3682a05` | grandfather backfill script (dry-run default) |

---

## DB changes already applied this session (additive, verified)

Applied by me to **Neon (unpooled `DIRECT_URL`)** via `db execute` — never `db push`, `Asset_searchVector_idx` untouched. `migrate diff` now shows **only** the known `DROP INDEX "Asset_searchVector_idx"` line (the out-of-band GIN index), confirming schema ↔ DB are in sync.

1. `prisma/sql/additive_pr2_dimensions.sql` — Member dimension columns, `MemberPsychographics`, `FieldDefinition`, `MemberEnrichmentStatus` enum, FK, dropped the stray `playing_with_neon`.
2. `prisma/sql/sponsor-audience-view.sql` — the `sponsor_audience_member` view. Verified live: **15 columns, 0 forbidden** (no archetype/psychographics/aiSummary/scores/raw householdIncome), 132 rows.

> These were applied because your `npx`-based run-path was broken (see gotcha above) and they're additive/idempotent/Producer-safe — same takeover pattern as the PR1 migration. If you re-provision a DB, re-run both files with the direct-binary command above.

---

## The firewall (how it's enforced — 3 layers)

Psychographic data (archetype / interests / tasteSignals) must never reach a **sponsor** surface. Operators are trusted and DO see it.

1. **Physical** — psychographics live in a separate `MemberPsychographics` table; the `sponsor_audience_member` view is a single-table projection with **no JOIN**, so it cannot reach it.
2. **Type** — `lib/intelligence/sponsor-safe.ts`: `SponsorAudienceMember` + a compile-time `Assert<…>` guard (adding a psychographic key fails the build) + `toSponsorAudienceMember()` runtime projection that drops any contaminant.
3. **Test** — `tests/unit/sponsor-firewall.test.ts`: source-scans every sponsor-facing module for psychographic reads + structural checks on the view SQL. **This is the gate — keep it green before shipping any sponsor surface.**

Note: the sponsor's own `PersonaCriteria.archetypes` *targeting input* (in `brief-assemble.ts`) is a filter, NOT a member-data leak, and is deliberately allowed. The scan targets member-psychographic READ tokens only (`MemberPsychographics`, `archetypeScores`, `archetypeAverages`, `tasteSignals`, `psychographics`).

---

## What I did NOT build (your call)

Per your instruction, **no rendered/design surfaces**: no record page, timeline UI, provenance badges, inline-edit UI, dimension panels, styling. The read-path API + data-access layer are the data those will consume.

---

## YOU RUN (data backfills — I only dry-ran them)

Both are idempotent, dry-run-verified read-only, and currently **no-ops on live data** (nothing to do), but they're ready:

1. **Populate psychographics** from Application archetype → `MemberPsychographics`:
   ```
   ./node_modules/.bin/tsx scripts/populate-psychographics.ts --dry-run   # 10 linked scored apps → 10 to create
   ./node_modules/.bin/tsx scripts/populate-psychographics.ts             # write
   ```
2. **Grandfather** legacy bypass-APPROVED members (flag only, no demote) + optional waitlist materialization:
   ```
   ./node_modules/.bin/tsx scripts/grandfather-members.ts                                   # dry-run (default)
   ./node_modules/.bin/tsx scripts/grandfather-members.ts --execute                         # flag pass
   ./node_modules/.bin/tsx scripts/grandfather-members.ts --execute --materialize-attendees # + orphan waitlist
   ```
   Dry-run on current data: **0 bypass-APPROVED, 0 orphan waitlist entries** — clean. Script is ready if that changes.

---

## PARKED — needs your decision

**TanStack Query is not installed.** Task 4 asked for "TanStack Query hooks + optimistic-mutation setup." Installing it adds a dependency + lockfile change + wrapping the **root layout** in a `QueryClientProvider` (an app-shell change). Per your own decision-rule ("real judgment call → STOP, write to NOTES"), I did **not** install it unsupervised.

Instead I built the **dependency-free data-access layer** the hooks wrap: `lib/member-client.ts` (`memberKeys`, `fetchMemberRecord`, `patchMemberFields`, `optimisticApplyFieldWrites`). Dropping TanStack on top is then purely additive. Drop-in hooks once you approve the dependency:

```ts
// lib/hooks/useMemberRecord.ts  (after: npm i @tanstack/react-query + provider in app/layout)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { memberKeys, fetchMemberRecord, patchMemberFields, optimisticApplyFieldWrites, type FieldWriteInput } from '@/lib/member-client';

export function useMemberRecord(id: string, limit?: number) {
  return useQuery({ queryKey: memberKeys.record(id, limit), queryFn: ({ signal }) => fetchMemberRecord(id, { limit, signal }) });
}

export function usePatchMemberFields(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: Record<string, FieldWriteInput>) => patchMemberFields(id, fields),
    onMutate: async (fields) => {
      const key = memberKeys.record(id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      if (prev) qc.setQueryData(key, optimisticApplyFieldWrites(prev as any, fields, new Date().toISOString()));
      return { prev };
    },
    onError: (_e, _f, ctx) => { if (ctx?.prev) qc.setQueryData(memberKeys.record(id), ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: memberKeys.record(id) }),
  });
}
```
Provider needed once in `app/layout.tsx` (or a client `Providers` wrapper): `<QueryClientProvider client={new QueryClient()}>`.

---

## API surface added (for PR3 UI)

- `GET /api/operator/members/[id]/record` — full record: core + grouped firmographic/demographic dimensions + `customFields`/`fieldProvenance` + engagement timeline + psychographics (operator-gated). `requireRole(READ_ONLY)`. Zod `?limit=1..200`. Returns the `MemberRecord` type from `lib/member-record.ts`.
- `PATCH /api/operator/members/[id]` — dimension write-path. `requireRole(STAFF)`. Body `{ fields: { <stableKey>: { value, source?, confidence? } } }`. Stamps `fieldProvenance[key] = {value, source, confidence?, syncedAt}`; source ∈ `self_reported|operator_entered|ai_inferred|verified_enrichment|producer` (default `operator_entered`). 409 on editing a soft-merged duplicate.

## Tests added (route coverage gap → closed for these)

`sponsor-firewall` (12), `member-provenance` (11), `member-patch-route` (9), `member-record` (6), `member-record-route` (5), `member-client` (7), + 3 new `findMergeCandidates` instagram cases. Money/access regression (GUEST-not-APPROVED, Application links member at submission, promotion preserves row) was already covered by `member-identity` / `member-no-approve-bypass` / `member-promotion`.

---

## Suggested next steps (PR3 proper, your review)

1. Approve TanStack dependency → drop in the hooks above + provider.
2. Build the record page F1–F8 (Attio/Linear-style) against `GET …/record` + the hooks — **your design review**.
3. Run the two backfills above when you're satisfied with the dry-run counts.
4. Seed a `FieldDefinition` set (PR3 ships a fixed set; the builder UI is V1.5).
