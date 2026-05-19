import type { WorkflowPath, WorkflowStep, WorkflowOutcome } from './types';

const dollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 });

function tierLabel(min: 'top' | 'mid' | 'low'): string {
  return min === 'top' ? 'top-tier members' : min === 'mid' ? 'members' : 'any member';
}

function renderStep(step: WorkflowStep): string {
  switch (step.type) {
    case 'apply':
      return step.requiresApproval
        ? 'submit an application and wait for approval'
        : 'submit a short application';
    case 'pay':
      return `pay ${dollars(step.amountCents)}`;
    case 'tier_check':
      return `be approved as ${tierLabel(step.minTier)}`;
    case 'invitation_code':
      return 'enter a valid invitation code';
    case 'referral':
      return step.minReferrals === 1
        ? 'be referred by a member'
        : `be referred by ${step.minReferrals} members`;
    case 'social_connect':
      return `connect ${step.platform}${step.followAccount ? ` and follow ${step.followAccount}` : ''}`;
    case 'on_list':
      return 'be on the VIP list';
  }
}

function renderOutcome(outcome: WorkflowOutcome): string {
  switch (outcome.type) {
    case 'free_ticket':
      return 'get free entry';
    case 'paid_ticket':
      return 'get a paid ticket';
    case 'waitlist':
      return 'be added to the waitlist';
    case 'auto_approve_member':
      return 'become a member automatically';
    case 'plus_one_unlock':
      return `unlock ${outcome.count} plus-one${outcome.count > 1 ? 's' : ''}`;
  }
}

/** Plain-English single-sentence summary of a workflow path. */
export function renderPathSummary(path: WorkflowPath): string {
  if (path.steps.length === 0) {
    return `Anyone can ${renderOutcome(path.outcome)}.`;
  }
  const stepsText = path.steps.map(renderStep).join(', then ');
  return `${capitalize(stepsText)} to ${renderOutcome(path.outcome)}.`;
}

/** Multi-path workflow summary. Returns one line per path. */
export function renderWorkflowSummary(paths: WorkflowPath[]): string[] {
  if (paths.length === 0) return ['No paths configured.'];
  return paths.map(renderPathSummary);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
