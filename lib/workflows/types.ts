/** Flexible event-workflow gates. Replaces the rigid accessMode enum.
 *  An event has one EventWorkflow; the workflow contains 1..n WorkflowPaths;
 *  each path is an ordered list of WorkflowSteps with a terminal WorkflowOutcome.
 *  A user can take any path whose steps they qualify for. */

export type WorkflowStep =
  | { type: 'apply'; requiresApproval: boolean; minScore?: number }
  | { type: 'pay'; amountCents: number }
  | { type: 'tier_check'; minTier: 'top' | 'mid' | 'low' }
  | { type: 'invitation_code'; codes: string[] }
  | { type: 'referral'; minReferrals: number }
  | { type: 'social_connect'; platform: 'instagram' | 'tiktok' | 'twitter'; followAccount?: string }
  | { type: 'on_list'; listType: 'PURPLE' };

export type WorkflowOutcome =
  | { type: 'free_ticket' }
  | { type: 'paid_ticket' }
  | { type: 'waitlist' }
  | { type: 'auto_approve_member' }
  | { type: 'plus_one_unlock'; count: number };

export type WorkflowPath = {
  id: string;
  label: string;
  description: string;
  steps: WorkflowStep[];
  outcome: WorkflowOutcome;
};

export type WorkflowTemplateKey =
  | 'open'
  | 'members_only'
  | 'apply_or_pay'
  | 'paid_only'
  | 'referral_required'
  | 'invitation_code';

/** Per-event workflow config persisted as EventWorkflow.paths (Json column). */
export type EventWorkflowPaths = WorkflowPath[];

/** Context passed to evaluateStep — what we know about the requesting user. */
export type WorkflowUserContext = {
  isMember: boolean;
  memberId?: string;
  memberTier?: 'top' | 'mid' | 'low';
  applicationScore?: number;
  referralCount?: number;
  invitationCode?: string;
  onPurpleList?: boolean;
};
