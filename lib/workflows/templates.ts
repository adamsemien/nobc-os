import type { WorkflowPath, WorkflowTemplateKey } from './types';

/** Per-template configurable options the operator sets in the event UI. */
export type WorkflowTemplateConfig = {
  /** Used by apply_or_pay, paid_only. */
  amountCents?: number;
  /** Used by apply_or_pay. */
  requiresApproval?: boolean;
  /** Used by referral_required. */
  minReferrals?: number;
  /** Used by invitation_code (comma-split into list). */
  codes?: string[];
  /** Used by members_only. */
  minTier?: 'top' | 'mid' | 'low';
};

export type WorkflowTemplateDef = {
  key: WorkflowTemplateKey;
  label: string;
  description: string;
  /** Build the paths array from the operator's config inputs. */
  build: (config: WorkflowTemplateConfig) => WorkflowPath[];
};

const cents = (n: number | undefined) => Math.max(0, Math.round(n ?? 0));

export const WORKFLOW_TEMPLATES: WorkflowTemplateDef[] = [
  {
    key: 'open',
    label: 'Open',
    description: 'Anyone can RSVP for free, no questions asked.',
    build: () => [
      {
        id: 'p-open',
        label: 'RSVP',
        description: 'Free entry, no application required.',
        steps: [],
        outcome: { type: 'free_ticket' },
      },
    ],
  },
  {
    key: 'members_only',
    label: 'Members only',
    description: 'Only approved members can attend. Auto-confirmed.',
    build: (c) => [
      {
        id: 'p-members',
        label: 'Reserve my spot',
        description: 'For members only.',
        steps: [{ type: 'tier_check', minTier: c.minTier ?? 'low' }],
        outcome: { type: 'free_ticket' },
      },
    ],
  },
  {
    key: 'apply_or_pay',
    label: 'Apply or pay',
    description: 'Apply for free entry, or skip the line and buy a ticket.',
    build: (c) => [
      {
        id: 'p-apply',
        label: 'Apply for free entry',
        description: 'Submit a short application. Approval required.',
        steps: [{ type: 'apply', requiresApproval: c.requiresApproval ?? true }],
        outcome: { type: 'free_ticket' },
      },
      {
        id: 'p-pay',
        label: 'Buy ticket',
        description: 'Skip the application, pay to enter.',
        steps: [{ type: 'pay', amountCents: cents(c.amountCents) }],
        outcome: { type: 'paid_ticket' },
      },
    ],
  },
  {
    key: 'paid_only',
    label: 'Ticketed',
    description: 'Paid entry only.',
    build: (c) => [
      {
        id: 'p-paid',
        label: 'Buy ticket',
        description: 'Paid entry.',
        steps: [{ type: 'pay', amountCents: cents(c.amountCents) }],
        outcome: { type: 'paid_ticket' },
      },
    ],
  },
  {
    key: 'referral_required',
    label: 'Referral required',
    description: 'Must be referred by an existing member.',
    build: (c) => [
      {
        id: 'p-referral',
        label: 'RSVP with a referral',
        description: 'Requires a member referral.',
        steps: [{ type: 'referral', minReferrals: Math.max(1, c.minReferrals ?? 1) }],
        outcome: { type: 'free_ticket' },
      },
    ],
  },
  {
    key: 'invitation_code',
    label: 'Invitation code',
    description: 'Must enter a valid code.',
    build: (c) => [
      {
        id: 'p-code',
        label: 'Enter invitation code',
        description: 'You’ll need a code we sent you.',
        steps: [{ type: 'invitation_code', codes: c.codes ?? [] }],
        outcome: { type: 'free_ticket' },
      },
    ],
  },
];

export function getWorkflowTemplate(
  key: WorkflowTemplateKey,
): WorkflowTemplateDef | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.key === key);
}

export function buildPathsFromTemplate(
  key: WorkflowTemplateKey,
  config: WorkflowTemplateConfig,
): WorkflowPath[] {
  const t = getWorkflowTemplate(key);
  if (!t) return [];
  return t.build(config);
}
