# backfill-member-firmographics

One-time enrichment script that fills **empty firmographic fields** on existing prod members
from two sources. Additive only, provenance-stamped, firewalled to firmographic data.

## What it does

For each member in the chosen workspace it gathers candidate values, then writes only to columns
that are currently `null` or `""`:

- **Phase 1 — application extract.** Reads the member's latest `Application` and feeds the three
  on-brand `/apply` freetext answers (`basics.whatYouDo`, `personality.workingOn`,
  `about.whatPeopleComeToYouFor`) to the Anthropic API (`generateObject`, locked model
  `claude-sonnet-4-20250514`). Extracts `{ companyName, companyDomain, industry, jobFunction, seniority }`.
  Source `application_extract`, confidence `0.65`.
- **Phase 2 — email domain heuristic.** Maps the member's email domain against `DOMAIN_MAP`.
  On a match, fills `companyName` / `companyDomain` / `industry`. Source `domain_heuristic`,
  confidence `0.5`. **Skips any field Phase 1 already filled.**

A field is written **only if its current column value is empty**. Existing values are never
overwritten. Personal-email domains (gmail, outlook, …) are skipped and not reported.

**Seed/demo personas are skipped entirely.** Members on a `@nobadco.dev` address (incl. subdomains
like `tenur.nobadco.dev`) are created by the seed scripts and are not real members — they are never
enriched and never reported as an unknown domain. Edit `SEED_EMAIL_DOMAINS` in the script to adjust.
The summary reports a `Skipped (seed/demo data)` count.

## Running it

Dry run (default — prints everything it WOULD write, writes nothing):

```bash
./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-member-firmographics.ts --workspace=<slug>
```

Execute (actually writes):

```bash
./node_modules/.bin/tsx --env-file=.env.local scripts/backfill-member-firmographics.ts --workspace=<slug> --execute
```

Options:

- `--workspace=<slug>` — **required.** Aborts if missing; never defaults to the prod workspace.
- `--execute` — perform writes. Omit for dry-run.
- `--limit=N` — process only the first N members (useful for a test batch).
- `--member=<id>` — process a single member (spot-check).

> **Note:** Phase 1 calls the Anthropic API in **both** dry-run and execute, so the dry-run preview
> reflects the real extraction — dry-run consumes API tokens. If `ANTHROPIC_API_KEY` is unset,
> Phase 1 is skipped and only the domain heuristic runs.

## Expanding DOMAIN_MAP

The dry-run summary prints every **unmatched** company domain with a count:

```
Unknown domains (expand DOMAIN_MAP): brex.com (3), hostfully.com (2), ...
```

Add entries to the `DOMAIN_MAP` const in `scripts/backfill-member-firmographics.ts`. The map key is
the email domain; `companyDomain` written is the key itself:

```ts
const DOMAIN_MAP: Record<string, { companyName: string; industry: string }> = {
  'brex.com': { companyName: 'Brex', industry: 'Fintech' },
  // ...
};
```

Re-run the dry-run after editing to confirm the new matches, then `--execute`.

## Provenance stamped

Every write stamps `fieldProvenance[key]` alongside the column value:

```ts
fieldProvenance[key] = { value, source, confidence, syncedAt }
```

| Source                | Confidence | Fields |
|-----------------------|-----------|--------|
| `application_extract` | `0.65`    | companyName, companyDomain, industry, jobFunction, seniority |
| `domain_heuristic`    | `0.5`     | companyName, companyDomain, industry |

> `application_extract` / `domain_heuristic` are **new provenance source strings**, outside the
> existing `ProvenanceSource` union (`self_reported`, `operator_entered`, `ai_inferred`,
> `verified_enrichment`, `producer`). The provenance badge layer (`lib/provenance-display.ts`)
> humanizes unknown sources gracefully ("Application extract" / "Domain heuristic"), and because
> they are not on the sponsor whitelist they are excluded from any source-filtered sponsor
> aggregate — the conservative behavior for low-confidence backfilled data.

## Firewall guard

The script writes **firmographic fields only** — `companyName`, `companyDomain`, `industry`,
`jobFunction`, `seniority`. Before any write payload is built, `assertFirmographicOnly()` throws if a
key is a reserved/firewall key (`archetype`, `archetypeScores`, `interests`, `tasteSignals`,
`psychographics`, …) or anything outside the firmographic whitelist. Archetype and psychographic
data live in `MemberPsychographics` and are never read or written here.

## Side effects

None. Direct Prisma writes only — no flow functions, no `emitEvent`, no Svix, no email, no Producer
webhook, no wallet calls. Each member's write is wrapped in a transaction; on error the member is
logged and skipped, and the run continues.
