# Agent Tools — Phase 2 Backlog

Phase 1 shipped 14 tools (8 read, 6 write). The remaining ~11 tools below
are deferred to a separate session.

## Deferred tools

| Tool | Group | Confirmation | Notes |
|------|-------|--------------|-------|
| `events.create` | events | yes | New event from structured input |
| `events.update` | events | yes | Edit event fields |
| `events.cancel` | events | yes | Cancel + notify registrants |
| `members.update_tier` | members | yes | Change member tier |
| `members.add_to_red_list` | members | yes | Add to denylist |
| `members.remove_from_red_list` | members | yes | Remove from denylist |
| `applications.update_score` | applications | yes | Manual scoring override |
| `payments.refund` | payments | yes | Operator-triggered Stripe refund |
| `questions.create` | questions | yes | New registration / application question |
| `questions.update` | questions | yes | Edit a question definition |
| `webhooks.test` | webhooks | no | Fire a test webhook delivery |
| `audit.search` | audit | no | Query the AuditEvent log |

## Deferred capabilities

- **Thread history view** — "show me recent conversations" UI; resume a past `AgentConversation`.
- **Multi-step planning** — agent decomposes a complex request into a plan, then executes steps.
- **Voice input** — master spec V2.
- **Runtype integration adapter** — V1.5. The `AgentTool` registry interface is already the
  swap point: the Runtype master agent consumes the same registry, no tool rewrites.

## Phase 1 known limitations

- `rsvps.comp_ticket` comps one ticket per call (RSVP is unique per workspace/event/member).
  Multi-recipient batching deferred. **Next pass:** when `Event.plusOnesAllowed`, batch
  "N tickets for one person" into a single RSVP with `plusOneCount = N - 1` (needs a
  `plusOneCount` field added to the RSVP model).
- `intelligence.run_metric` / `intelligence.compose` accept `filters` but date-range and
  compare-period context are not yet wired through from the agent.
- Rate limiting is in-memory per instance — a shared store (Redis/Upstash) is a V2 item.

## Schema follow-ups

- **`members.find` archetype filter** — blocked on schema. `Application.memberId` is a loose
  FK column with **no declared Prisma relation**, and `Member` has no `archetype` column.
  Adding an archetype filter to `members.find` needs a migration: declare the
  `Member ↔ Application` relation (`Member.applications` / `Application.member`). A member's
  archetype then reads from their most recent Application. Until then, archetype is an
  application-only filter.
