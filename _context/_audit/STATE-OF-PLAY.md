# State of Play — Resume Here

> **If you are a fresh Claude Code session, read this first.** It is the live
> handoff. Single owner: the "Apex / security-and-strategy" session (Opus 4.8).
> Last updated: **2026-06-12**. Update this file whenever the state below changes.
>
> **Provenance note:** items tied to a merged PR number are code-verified against
> `origin/main`. Items marked _(session notes)_ come from working memory / the
> second-brain capture and have **not** been independently re-verified in code here —
> confirm before relying on them.

`main` is synced to **`origin/main` @ `991043c` (#101)** as of 2026-06-12.

---

## 1. What shipped since the 2026-06-09 doc (`#62` → `#101`, all merged)

The 06-09 doc stopped at the security remediation (`#50`–`#62`). Since then the
**CRM-spine build** — the moat the strategy doc said was "barely built" — went from
nothing to its first live surfaces:

| Theme | Merged PRs |
|---|---|
| **CRM connectors** (pure, testable adapters) | `#90` Producer vendor connector · `#91` CSV connector (RFC-4180) · `#95` ingestion identity-resolution · `#96` CSV import preview (dry-run) · `#98` beehiiv · `#99` ActiveCampaign |
| **CRM spine schema + surface** | `#92` Contact-spine schema (roles + `ContactSource`, additive) · `#89` "Who's coming" audience panel (first visible CRM surface) |
| **Member intelligence / memory** | `#68` cross-event guest-memory aggregation (Phase C) |
| **Operator** | `#88` The Back Room (knock easter egg, Darkroom theme, Last Call door game) · `#93` Editorial theme in Cmd+K |
| **Hardening / fixes** | `#100` AI Event Builder hardened vs Anthropic API errors · `#101` DAM + House Phone mobile-usable |
| **Data** | **`#57` migration-history drift reconciled** — the open flux gate from the last doc is **CLOSED** |

Earlier in the same window (already on `main`): `#70`/`#72` ticketed money-path
hardening + purchase confirmation email, `#76` Gravity Ledger, `#71` member-connections
graph, `#82`/`#83`/`#86` operator-access hardening + intentional org creation +
member-portal identity S-slice, `#87` public `/e/[slug]` buyer page for orgless buyers.

**Security:** the CRITICAL + HIGH audit tier remains closed (`#50`–`#62`); CI gate
(`#61`) still guards `main`.

## 2. Strategy thesis (where the product is going)

Source of truth: **`_context/_audit/PRODUCER-OPERATOR-STRATEGY.md`** (§10 thesis v2,
supersedes §9). Also note CLAUDE.md now points to `_context/NoBC_OS_Operating_Doc.md`
as product source-of-truth — **⚠️ that file is currently MISSING from the repo** (see §7).

- **Wedge:** product **indispensability** for **local, fast-paced growing event brands**
  (NOT enterprise luxury, NOT intelligence-led).
- **Constituencies, sequenced:** creators (primary) → members/guests (bottom-up; must beat
  Lu.ma/Posh on experience) → sponsors (fast-follow). _(session notes add sponsor sales
  pipeline as a third CRM pillar.)_
- **Means:** converge Producer (back-of-house) + Operator (front-of-house) into **one shared
  community-CRM spine** (member/guest/vendor/sponsor = roles, not separate tables). The
  connector wave above is the first real construction of that spine.
- **Build-vs-thesis:** the 06-09 doc rated this 6/10 with the moat "barely built." That has
  moved — the spine schema (`#92`), first connectors (`#90`/`#91`/`#95`/`#96`/`#98`/`#99`),
  and the first member-facing surface (`#89`) are now merged. Re-rate after `#97` lands.

### Producer integration — contract confirmed _(session notes)_
- Producer ↔ Operator run on **separate databases** (the old "shared Postgres" claim is
  false) — **CONFIRMED 2026-06-12: Producer is dev-stage, no prod DB or Clerk** (Producer-side audit + `migrate diff`). `#57` reconciled Operator's **own** migration history — the last open data gate.
- Producer CRM export contract confirmed: `DirectoryCompany` field shape, **HMAC
  canonicalization** signing recipe, separate DB. `#90` Producer connector verified live
  (12 demo vendors pulled E2E) _(session notes)_.
- **Airtable = retire** direction. **Tenur** (Eric): MCP-only, teams account, **no API yet**.

### Clerk _(session notes)_
- Clerk **production flip verified; config batches 1–3 live.** This closes most of the
  pre-launch items in `CLERK-CONFIG-AUDIT.md` (now landed in `_context/_audit/`). Re-audit
  the remaining "Adam decision" rows (MFA policy, org-creation limits) against the live dashboard.

## 3. Open PRs (authoritative, `gh pr list` 2026-06-12)

| PR | Title | Branch | Note |
|---|---|---|---|
| `#102` | House Phone: SMS opt-out (STOP) as compliance, not error | `fix/sms-optout-handling` | recent |
| `#97` | **CRM ingestion persist layer + CSV/Producer commit + Save UI** | `feature/crm-ingest-persist` | **active build front** — wires the merged connectors to the DB |
| `#94` | Last Call draws guests from the real workspace roster | `last-call-real-room` | follow-on to `#88` |
| `#80` | Stripe test-mode validation harness | `chore/validate-stripe-harness` | owns `scripts/validate-stripe.ts` — do NOT duplicate elsewhere |
| `#73` | additive `SmsMessage.twilioSid` for SMS idempotency | `chore/sms-twilio-sid` | additive schema |
| `#64` | event-access gate + ticketing coverage (+ merge-prep docs) | `tests/money-path-access-gate` | test backlog — may overlap merged coverage |
| `#54` | media QR in-repo + DAM thumb cache header | `fix/infra-audit-warnings` | audit infra WARNING/INFO |
| `#52` | money-path + event-access gate coverage (audit CRITICAL #7/#8) | `test/critical-path-coverage` | test backlog — may overlap merged coverage |
| `#46` | [draft] world-class pass #1 — `next/image` on member surfaces | `polish/world-class-pass` | WIP draft |

## 4. Open gates / next

- **Build front is `#97`** (CRM ingest-persist) — once it lands, ingestion is end-to-end
  (connector → identity-resolve → persist → Save UI) and the spine has its first round-trip.
- **Triage the test-coverage PRs** (`#52`, `#64`): confirm whether they're superseded by the
  already-merged money-path coverage before merging — avoid duplicate/ conflicting specs.
- **G6 / RLS** (tenant-isolation multiplier) — still not started; revisit after the spine
  round-trip proves out.
- **`docs/session-state` branch is a STALE REVERT-BOMB** — it branched off an old `main` and
  merging it would delete ~162 files / ~16k lines (the entire connector-test suite). **Do not
  merge it.** This doc supersedes it.

## 5. Ownership + working rules

- **Single owner** of: Operator security/correctness, `PRODUCER-OPERATOR-STRATEGY.md`,
  this STATE doc, merge management, and the convergence build.
- Work happens in **git worktrees** under `.claude/worktrees/` (branch per concern).
  New worktree deps: symlink `node_modules` + `.env.local` from repo root. Verify with
  `node_modules/.bin/tsc --noEmit` + `node_modules/.bin/vitest run` (Turbopack build fails on
  cross-root symlinks — use `node_modules/.bin/next build` (webpack) locally).
- **Hard rules (unchanged):** never `prisma db push` (additive `migrate diff` → `db execute`,
  file-only, Adam runs DB steps); `npx prisma` broken → `node node_modules/prisma/build/index.js`;
  locked AI model `claude-sonnet-4-20250514`; email from `team@thenobadcompany.com`; never touch
  `/apply` screen-7 legal copy or archetype config; workspace-scope every query; semantic tokens
  only (no hex); terminology law (Access not RSVP, etc.); branch per concern; **no merge without
  Adam** (owner may merge with standing authorization — confirm per batch).

## 6. Immediate next actions (for the owner)

1. Review + merge this sync branch (`chore/sync-state-2026-06-12`): refreshed STATE doc,
   landed audit docs, `.claire/` ignore, `inspect-stripe-test.ts`.
2. **Add `_context/NoBC_OS_Operating_Doc.md`** — CLAUDE.md treats product/feature work as
   blocked until it exists (see §7).
3. Review `#97` (CRM ingest-persist) — the active build front.
4. Triage the backlog test PRs (`#52`, `#64`) for overlap before merging.

## 7. Loose ends folded in by this sync (2026-06-12)

- Landed three previously-untracked audit docs into `_context/_audit/`: `CLERK-CONFIG-AUDIT.md`,
  `MEMBER-PORTAL-IDENTITY-SCOPE.md` (Option B plan; `#86` shipped its S-slice),
  `PUBLIC-CHECKOUT-SECURITY-REVIEW.md` (F1/F2 findings since shipped — now a historical record).
- `scripts/validate-stripe.ts` left untracked on `main` — it is byte-identical to PR `#80`'s
  copy; that PR owns it.
- `scripts/inspect-stripe-test.ts` landed (the only orphaned, un-backed-up script).
- `.claire/` (local worktree tooling) added to `.gitignore`.
- **⚠️ `_context/NoBC_OS_Operating_Doc.md` is referenced by CLAUDE.md but does not exist in the
  repo.** Not authored here (no source content). Owner must add it.
