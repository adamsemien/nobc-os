# Sponsor Intelligence build — PROGRESS (durable state)

Branch: `feat/sponsor-intelligence` off `origin/main` (23828e1). Scratch dir is untracked — NOT in the PR.
Raw build brief: `_context/_audit/sponsor-intelligence/build-brief-raw.json`.

## Locked decisions
- Brief fields on `SponsorBrandProfile` (no EventSponsor). Brand-level; per-event reproducibility via `RecapSnapshot`.
- Recap = NEW route `POST /api/intelligence/activation-recap` (not compose/reports).
- `SurveyPhase` new CREATE TYPE `{PRE,POST,ACTIVATION}` (avoids ALTER TYPE on QuestionFlowStep).
- Booth form scoped via additive `EventCustomQuestion.sponsorBrandId`. Responses = SurveyResponse(phase=ACTIVATION).
- PDF: `@react-pdf/renderer` + repo TTFs + `lib/pdf/palette.ts` (only hex-allowed file, derived from CSS tokens).
- Delivery: GeneratedAsset.magicLinkUrl + token route reusing scrypt password + HttpOnly cookie + R2 presign.
- Numbers in code (lib/intelligence/*). Prose by model: recap=Sonnet(lock); one-sheeter narrative=Haiku(exception, sponsor/actions.ts only).
- PII: aggregate-only; <5 suppression at aggregation layer.

## HARD constraints
- NEVER `prisma db push`. Additive only: edit → generate → migrate diff → review (refuse DROP/ALTER TYPE/RENAME) → db execute.
- Model lock claude-sonnet-4-20250514; Haiku only authorized in sponsor/actions.ts.
- workspaceId on every new table + index + checked on every query.
- No hex in components (lib/pdf/palette.ts excepted, documented).
- Sponsors never see PII. <5 suppression. From = team@thenobadcompany.com.
- Do not touch /apply, config/archetypes.ts, legal copy.

## Env (local .env.local) — present: DATABASE_URL(shared prod), ANTHROPIC_API_KEY, R2_*, RESEND_API_KEY, NEXT_PUBLIC_APP_URL.

## Schema additions (per-phase, each self-contained + additive)
- P0: SponsorBrandProfile +declaredObjectives/targetPersonaCriteria/rightsFeeCents +recapSnapshots[]; Workspace +recapSnapshots[]; NEW RecapSnapshot.
- P1: NEW enum SurveyPhase{PRE,POST,ACTIVATION}; NEW SurveyResponse; back-rels Workspace/Member/SponsorBrandProfile.
- P2: EventCustomQuestion +sponsorBrandId(+index+relation); SponsorBrandProfile +sponsorScopedQuestions[].

## STATUS
- [x] Precondition gate (Media PR #42 open, tree clean)
- [x] Branch feat/sponsor-intelligence off origin/main
- [x] Understanding sweep + build brief
- [x] P0 schema edit + generate + diff + execute (additive applied; GIN intact)
- [x] P0 lib/intelligence (influence-tiers, recap-types, metrics, EMV, format, narrative[Haiku], deliverables, assemble, delivery, resolve)
- [x] P0 lib/pdf (palette, fonts, recap-document, render)
- [x] P0 route + magic-link delivery (/doc/[token] + auth + download) + Recap Studio UI + seed + render (PDF 78KB, 5pp, validated)
- [x] P0 verify (tsc 0 err, next build pass, 58 unit tests pass) + commit "Phase 0: Activation Recap generator"
  NOTE: demo data tagged __demo_recap (28 PENDING/GUEST members, 0 APPROVED). Clean: npx tsx scripts/seed-sponsor-recap.ts --clean
  NOTE: local R2 creds empty → storage no-ops locally; works on Vercel preview (R2_* set).
- [x] P1 schema (SurveyPhase + SurveyResponse) applied; survey.ts (PRE/POST questions + computeBrandLift top-box lift/recall/NPS/conversation/quotes); dispatch route + public /survey/[token] + submit; survey_invite email template; assembleRecap auto-computes affinity; RecapStudio send buttons; seed surveys (+37pp lift, small-sample). tsc/build/58 tests pass. commit "Phase 1: brand-lift survey orchestration"
- [x] P2 schema (EventCustomQuestion.sponsorBrandId) applied; activation.ts (booth questions + computeAcquisition + booth-link GeneratedAsset); /activation/[token] + submit; assembleRecap auto-acquisition; brief-assemble (workspace audience deep-dive + persona match + historical projection → RecapPayload kind brief); brief-document.tsx; renderDocPdf branch; recap-delivery storeAndDeliver + generateAndStoreBrief; audience-brief + booth-link routes; SponsorBriefBar wired; RecapStudio booth + presale buttons. tsc/build/58 tests pass. Seed: 16 booth interactions (75% opt-in), brief from real 132 approved members + 5-event projection ($22k). commit "Phase 2: ..."
- [x] Adversarial review (0 critical/0 high) + all medium/low fixes applied (commit d874c83)
- [x] CONTEXT.md updated (closing checklist)
- [x] ONE PR #43 (no merge) · preview deploy READY (target=null, not prod) · report delivered
  PR: https://github.com/adamsemien/nobc-os/pull/43
  Preview: https://nobc-4dx773cey-adam-semiens-projects.vercel.app (redeployed 2026-06-01 post-CPM re-tier @ 5f79aea; target=null/preview)
  PROD (Adam-authorized 2026-06-01): vercel --prod from branch @ 5f79aea → https://nobc-6v3ozfl27-adam-semiens-projects.vercel.app, aliased https://nobc-os.vercel.app (target=production, READY). Recap Studio: /operator/intelligence/recap (admin). PR #43 STILL UNMERGED — prod runs the branch and REVERTS on the next deploy from main. Route verified live (307→Clerk sign-in with browser Accept; bare curl 404s = Clerk's unauth response, control /operator behaves identically).
  DONE 2026-06-01.
