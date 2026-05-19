/** Workflow execution engine.
 *
 *  Given an EventWorkflow + a user context, decide which paths the user can take
 *  and (separately) execute the outcome of a chosen path. Side effects (RSVP
 *  creation, member promotion, etc.) live in their own handlers — this module
 *  only orchestrates. */

import type {
  WorkflowPath,
  WorkflowStep,
  WorkflowOutcome,
  WorkflowUserContext,
  EventWorkflowPaths,
} from './types';

export type StepResult = { ok: true } | { ok: false; reason: string };

const tierRank: Record<'top' | 'mid' | 'low', number> = { low: 0, mid: 1, top: 2 };

export function evaluateStep(step: WorkflowStep, user: WorkflowUserContext): StepResult {
  switch (step.type) {
    case 'apply':
      // Anyone can apply — gating happens after submission.
      return { ok: true };
    case 'pay':
      // Anyone can pay — actual payment happens in executeOutcome.
      return { ok: true };
    case 'tier_check': {
      if (!user.isMember || !user.memberTier) {
        return { ok: false, reason: 'Members only.' };
      }
      if (tierRank[user.memberTier] >= tierRank[step.minTier]) return { ok: true };
      return { ok: false, reason: `Requires ${step.minTier}-tier or above.` };
    }
    case 'invitation_code': {
      if (!user.invitationCode) return { ok: false, reason: 'Invitation code required.' };
      const ok = step.codes
        .map((c) => c.trim().toLowerCase())
        .includes(user.invitationCode.trim().toLowerCase());
      return ok ? { ok: true } : { ok: false, reason: 'Invalid invitation code.' };
    }
    case 'referral': {
      const have = user.referralCount ?? 0;
      if (have >= step.minReferrals) return { ok: true };
      return { ok: false, reason: `Need ${step.minReferrals} referral${step.minReferrals > 1 ? 's' : ''}.` };
    }
    case 'social_connect':
      // V1: trust client. Real verification deferred.
      return { ok: true };
    case 'on_list':
      return user.onPurpleList
        ? { ok: true }
        : { ok: false, reason: 'You must be on the list.' };
  }
}

/** Path applicability — true if every step passes for this user. */
export function evaluatePath(path: WorkflowPath, user: WorkflowUserContext): StepResult {
  for (const step of path.steps) {
    const r = evaluateStep(step, user);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Returns the paths a user can take right now. */
export function getApplicablePaths(
  paths: EventWorkflowPaths,
  user: WorkflowUserContext,
): WorkflowPath[] {
  return paths.filter((p) => evaluatePath(p, user).ok);
}

/** Pure description of what an outcome will do. Side effects are handled by
 *  the caller (so this engine stays testable without a DB). */
export type OutcomePlan =
  | { kind: 'create_rsvp_free' }
  | { kind: 'create_rsvp_paid'; amountCents: number }
  | { kind: 'create_application_pending' }
  | { kind: 'add_to_waitlist' }
  | { kind: 'promote_to_member' }
  | { kind: 'unlock_plus_ones'; count: number };

export function planOutcome(
  outcome: WorkflowOutcome,
  path: WorkflowPath,
): OutcomePlan {
  switch (outcome.type) {
    case 'free_ticket':
      // If the path requires an application that needs approval, route through application
      // queue instead of directly issuing the ticket.
      if (path.steps.some((s) => s.type === 'apply' && s.requiresApproval)) {
        return { kind: 'create_application_pending' };
      }
      return { kind: 'create_rsvp_free' };
    case 'paid_ticket': {
      const payStep = path.steps.find((s) => s.type === 'pay');
      const amount = payStep?.type === 'pay' ? payStep.amountCents : 0;
      return { kind: 'create_rsvp_paid', amountCents: amount };
    }
    case 'waitlist':
      return { kind: 'add_to_waitlist' };
    case 'auto_approve_member':
      return { kind: 'promote_to_member' };
    case 'plus_one_unlock':
      return { kind: 'unlock_plus_ones', count: outcome.count };
  }
}

/** Cheap heuristic to map memberStatus + tier label to a low/mid/top bucket. */
export function tierFromScore(score: number | null | undefined): 'top' | 'mid' | 'low' {
  const s = score ?? 0;
  if (s >= 73) return 'top';
  if (s >= 53) return 'mid';
  return 'low';
}
