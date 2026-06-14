# Salvaged stashes — 2026-06-13

The primary checkout (`~/nobc-os`) carried 5 git stashes. As part of getting the
checkout clean and onto `origin/main` (`9515350`, deployed #107), each stash was
exported to a `git apply`-able patch here, committed, and pushed to origin — then
the stashes were dropped. **Nothing was lost; everything below is recoverable**
via `git apply <patch>` from a checkout of the matching base.

| Patch | Original stash label | Base date | Assessment |
|---|---|---|---|
| `stash0-adam-untracked-docs-and-stale-code-2026-06-10.patch` | `On main: adam-untracked-docs-and-stale-code` | 2026-06-10 | **Mixed.** 21 net-new planning docs (`_context/16-member-intelligence/*`, strategy/`today-*` audit docs) — potentially worth resurrecting. Plus `lib/ticket-confirmation.ts` + its test, which are **already on `origin/main`** (superseded). |
| `stash1-adam-local-edits-pre-pull-2026-06-10.patch` | `On main: adam-local-edits-pre-pull` | 2026-06-10 | **Superseded.** Pre-pull edits to 4 tracked files (payments CONTEXT, stripe webhook route, email-templates, event-access-submit); later merges (#102–#107) carry the equivalent. Archived for safety. |
| `stash2-12-intelligence-context-edit-2026-06-04.patch` | `On feat/sponsor-intelligence: wip: 12-intelligence CONTEXT edit` | 2026-06-04 | **Superseded.** Trivial 2-line CONTEXT doc edit. |
| `stash3-wip-before-context-sync-2026-05-28.patch` | `On claude/operator-detail-panel-width: wip-before-context-sync` | 2026-05-28 | **Superseded.** A `.gitignore` one-liner (plus incidental untracked capture). |
| `stash4-member-qr-rollout-2026-05-25.patch` | `On main: member-qr rollout (NOT yet merged)` | 2026-05-25 | **Superseded.** The member-QR rollout shipped (`lib/member-qr.ts` `generateMemberQrCode()` is wired into prod paths per CLAUDE.md); this is the pre-merge WIP. |

## To restore one

```bash
# from a checkout at (or near) the patch's base ref
git apply _context/_audit/salvage-stashes/<patch-file>
```

If `git apply` reports drift (base advanced), use `git apply --3way` or apply hunk-by-hunk.
