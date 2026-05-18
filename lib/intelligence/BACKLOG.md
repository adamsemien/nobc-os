# Metric Registry — Backlog

First wave (built): `pipeline.application-funnel`, `pipeline.charter-conversion`,
`community.archetype-distribution`, `engagement.dormancy-cohort`,
`taste.top-advocated-brands`, `sponsors.sponsor-fit-score`.

## Next metrics

Each is one file under `lib/intelligence/metrics/{category}/` + an import in `index.ts`.
No UI changes required — the dashboard composes whatever the registry exposes.

- `pipeline/time-to-first-rsvp.ts` — days between approval and first RSVP
- `pipeline/source-quality.ts` — which referrer brings Charter-tier applicants
- `community/tier-mix.ts` — Charter / Standard / Waitlist composition over time
- `community/geographic-clustering.ts` — neighborhood and city density
- `engagement/attendance-rate-per-member.ts` — RSVPs vs check-ins per member
- `taste/splurge-vs-save.ts` — value-signal patterns from the splurge/save question
- `sponsors/recurring-format-fit.ts` — which recurring format fits which sponsor
- `revenue/revenue-per-member.ts` — ticket + comp revenue attributed per member

## Deferred infrastructure

- Insight generator — nightly Claude (`claude-sonnet-4-20250514`) narrative call
  (scaffold + cron stub built; wiring lands next session)
- Saved dashboard layouts (v2)
- Ad-hoc report builder UI (once the registry has 25+ metrics)
