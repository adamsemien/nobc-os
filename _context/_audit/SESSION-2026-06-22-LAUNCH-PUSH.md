# Session 2026-06-22 — Apply Launch Push (backup + apply-resolve)

> Live working log for the push to get `/apply` + the application backup launch-ready.
> Read this alongside `STATE-OF-PLAY.md`. Last updated 2026-06-22 (Claude, mid-session while Adam stepped away).

---

## ✅ What got fixed / shipped this session

1. **Overnight branches merged to `main` → prod** (in order, verified):
   - #115 EnvBadge (which-env indicator) · #117 Discover hero-crop + DAM grid refresh · #118 mobile/iPhone + upload magic-byte sniffing.
   - The held DAM-touching branches were rebased onto the integrated `main` (Stage-15 DAM suite), `prisma generate` re-run, `tsc` green, then merged.
2. **Application backup + /apply hardening were already on `main`** (swept in by the DAM integration union-merge). The redundant **PR #116 was closed** after a rebase showed zero diff.
3. **Production DB migration applied** — `prisma/sql/application-backup.sql` run against the prod Neon DB via the Neon SQL Editor. `ApplicationBackup` table + `BackupStatus` enum verified present.
4. **Google Drive backup creds set in Vercel Production** (`GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` / `_PRIVATE_KEY` / `_FOLDER_ID`). Verified the creds work end-to-end via a standalone self-test (service account → Shared Drive write succeeded). The drive **"NoBC Application Backups"** is a **company-owned Shared Drive** (`team@thenobadcompany.com` = Manager; service account = Content Manager — good least-privilege; it can write but not delete).
5. **🔴→✅ Apply-submission launch blocker found AND fixed.** The public `/apply` form loaded but **submitting returned 500 `{"error":"Workspace not found"}`** — `APPLY_DEFAULT_WORKSPACE_ID` (prod) pointed to a workspace ID not in the prod DB. Repointed it to the real workspace **`cmpd6xckn000004jl47xpwghx`** ("No Bad Company", 176 members / 18 events / 59 applications) and redeployed. **Apply create + submit now return 200** (verified: archetype computed = "Connector").

---

## 🔴 OPEN: the backup is not producing files in prod yet

**Symptom:** A real test application submitted to prod (`cmqplc5sf000204jsvfoqcvvw`) returned 200 and scored fine, but **no backup JSON landed in Drive after 45s.** A full Drive listing confirms **zero `.json` backups exist** anywhere (only the leftover `backup-selftest.txt` from the manual creds test). No `[application-backup]` runtime logs; no `[backup-applications]` cron logs in 3h (Vercel log tool was also timing out / unreliable).

**What's proven:** creds work · Drive works · table exists · env vars present in Vercel Production · `after(backupApplication)` is correctly placed (not dead code) · Next 15.5 supports `after()`.

**Leading hypotheses (unresolved):**
- (a) The running prod functions don't actually see `GOOGLE_DRIVE_*` (a `vercel redeploy` may reuse a stale env snapshot) → `isDriveBackupConfigured()` false → backup left PENDING silently.
- (b) `GOOGLE_DRIVE_PRIVATE_KEY` pasted into Vercel is malformed (Adam flagged this) → `createSign` throws → row FAILED (but no error log seen — log tool unreliable).
- (c) `after()` not executing on this deployment (unusual on 15.5/Vercel).
- (d) The reconciliation cron (`/api/cron/backup-applications`, hourly in `vercel.json`) isn't firing — **possible Vercel plan limit: Hobby crons run ~once/day, not hourly.** Worth checking the Vercel plan.

**Diagnosis progress (mid-session):**
- ❌ **Key ruled out.** Re-set `GOOGLE_DRIVE_PRIVATE_KEY` in Vercel from a locally **sign-verified** value + redeployed → backup *still* produced no file. So it is NOT a malformed key.
- 🔎 **Drive confirmed empty** (full tree listing: only the leftover `backup-selftest.txt`; zero `.json`). So the backup write-through is simply not executing.
- ⚠️ **The empty commit `a5b5987` did NOT trigger a Vercel deploy** (Vercel ignores no-change commits), so that "fresh deploy" never happened.
- ⚠️ **Every production deployment in play is a `vercel redeploy`** (action: "redeploy"), and the running prod is commit **`af49d31` (#117)** — **`757a926` (#118) never natively deployed.** Leading hypothesis: **Next.js `after()` / Vercel `waitUntil` is not firing on *redeployed* deployments — it needs a native git build.** (`isDriveBackupConfigured()` only checks presence and all 3 vars are set + redeploys read current env — proven by the APPLY fix taking effect — so config should be true; the callback just isn't running.)
- **Action:** triggering a **native git deploy of current `main`** (commits this doc → forces a real Vercel build, which also finally ships #118), then re-testing. If backup fires on a native build, the redeploy-`after()` theory is confirmed.

**Definitive next diagnostic (needs Adam — Neon SQL Editor, prod):**
```sql
SELECT id, "applicationId", status, attempts, "lastError", "backedUpAt", "updatedAt"
FROM "ApplicationBackup"
WHERE "applicationId" = 'cmqplc5sf000204jsvfoqcvvw';
```
- No row → `after()` never ran. · PENDING → ran but dormant (env not seen, hypothesis a). · FAILED + `lastError` → key/Drive error (hypothesis b; lastError says which). · DONE → it worked and the Drive search raced.

---

## 🟠 Environment & Organization findings (the dev/sandbox/prod muddiness, mapped)

**Prod DB has 7 workspaces** — only ONE is real:

| workspace | id | data |
|---|---|---|
| **No Bad Company (REAL)** | `cmpd6xckn000004jl47xpwghx` | 176 members · 18 events · 59 apps |
| Adam's Organization | `cmpfl7cbr…` | 1 · 0 · 1 |
| No Bad Company (dup, empty) | `cmph3kkfc…` | 0 · 1 · 0 |
| My Test Organization · NoBC Sandbox · test · Adam testing | … | all 0 · 0 · 0 |

The 6 junk workspaces came from a **broken onboarding flow that spun up Clerk orgs in a loop**. Adam has deleted the stray orgs in Clerk. **Clerk Production** now has the real **"No Bad Company"** org (`org_3DuwYJj9…`, 4 members) + a stray **"NoBC Sandbox"** (harmless). **Clerk Development** has test orgs (fine). Nothing critical was deleted — the real prod org is intact, which is why the operator dashboard still shows the 176 members.

**Domain routing:** the live app + apply form are at **`app.thenobadcompany.com/apply`** (Vercel) — NOT the apex `thenobadcompany.com`, which is a **Cloudflare-served marketing/landing site** and 404s on `/apply`. Share the `app.` URL, or add an apex→app `/apply` redirect.

**Prod is seeded with demo data** (Adam's note: "useless and dumb data"). The 176 members / 59 apps in the real workspace are largely demo/seed. Cleaning prod data before real launch is a separate, careful task (workspace/data deletion cascades through ~53 tables — never a casual click).

---

## 🎙️ Feature idea captured (BACK BURNER per Adam): voice-driven application

Adam wants the long application to be completable as a **voice conversation with an AI** — an interview that asks the questions conversationally and fills the application, instead of typing a long form. Two shapes floated: (1) a per-field voice button, (2) a full "voice moat" interview. Framed as a differentiator/"moat" and on-brand for a premium curated club.

**Feasibility sketch (for later scoping):**
- Fits the stack as: speech-to-text (Whisper/Deepgram) → **Claude conducts the interview** and maps answers to the application's `basics.* / personality.* / community.* / taste.* / about.*` keys → optional TTS for Claude's voice. Claude already runs the scoring, so the interview + mapping is in-house.
- A realtime voice model (OpenAI Realtime etc.) gives the most natural turn-taking but conflicts with the **locked Anthropic model** + adds a vendor — needs Adam's explicit sign-off.
- **Architecture note (important):** the voice interview should write to the application **data model directly** (the `/api/apply/membership` create + answers API), NOT drive the DOM form — because native form controls (e.g. the birthday `<input type="date">`) are exactly what blocks AI/agent automation (see below).
- This is **deferred** — do not build until the launch (backup + questions) is done and Adam green-lights scope.

---

## 🟡 Birthday / date field finding (from Adam's "Hermes" agent getting stuck)

The birthday field is a **native `<input type="date">`** (`MembershipForm.tsx:1080`). Assessment:
- **For real humans: fine.** Native, accessible; iPhone shows the native wheel.
- **For bots/AI agents: a known blocker** — automation can't drive the OS-level date picker. So Hermes stalling there is expected and is **not evidence of a broken field for real applicants.**
- **Mild real-user friction:** native date pickers default to *today*, so a birthday means scrolling back decades. A guided 3-field (month/day/year) or a defaulted picker would be smoother — but that's a **design decision on the sensitive apply form**, deferred to Adam.
- **Ties to the voice idea:** if AI agents are meant to complete applications, native pickers must be bypassed (write to the data model, not the DOM).

---

## ❓ Decisions / questions for Adam (when you're back)

1. **Backup diagnosis:** run the `ApplicationBackup` query above and paste it — it pinpoints the exact failure (env-not-seen vs. key-error vs. after-not-firing).
2. **Vercel plan:** is the project on **Hobby or Pro**? Hobby caps crons to ~once/day, which breaks the hourly reconciliation safety net. (Real-time `after()` is the primary path; the cron is the backstop.)
3. **Private key:** you suspected the Vercel paste may be wrong. I have a verified-working value — say the word and I'll re-set `GOOGLE_DRIVE_PRIVATE_KEY` in Vercel from it.
4. **Apply URL:** confirm you'll share **`app.thenobadcompany.com/apply`** (or want me to wire an apex `/apply` redirect).
5. **Prod data:** do you want a clean prod reset (wipe demo members/apps) before real launch, or keep the seed for now? (Careful, cascading — I'll plan it, not execute without sign-off.)
6. **Org cleanup:** OK to remove the stray **"NoBC Sandbox"** org from **Clerk Production** and prune the 6 empty DB workspaces? (Also careful/cascading.)
7. **New apply questions:** still the other launch gate — send the set when ready.
8. **Voice interview:** confirm it stays back-burner until backup + questions are done (recommended).
