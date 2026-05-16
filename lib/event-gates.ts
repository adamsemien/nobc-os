export const GATE_TYPES = [
  'application',
  'ticket',
  'rsvp',
  'referral',
  'waitlist',
  'age_check',
  'custom_question',
] as const

export type GateType = (typeof GATE_TYPES)[number]

export type Gate = {
  id: string
  type: GateType
  label: string
  capacity?: number | null
  approvalRequired?: boolean
  deadline?: string | null
  priceCents?: number
  question?: string
  questionType?: 'yes_no' | 'short_text'
}

export const GATE_META: Record<GateType, { label: string; description: string; emoji: string }> = {
  application: {
    label: 'Application',
    description: 'Guest fills out a form. You review and approve.',
    emoji: '📋',
  },
  ticket: {
    label: 'Ticket Purchase',
    description: 'Guest buys a ticket to confirm their spot.',
    emoji: '🎟',
  },
  rsvp: {
    label: 'RSVP',
    description: 'Simple yes/no confirmation. No payment.',
    emoji: '✓',
  },
  referral: {
    label: 'Referral',
    description: 'Guest must be referred by an approved member.',
    emoji: '👥',
  },
  waitlist: {
    label: 'Waitlist',
    description: 'Guest joins a waitlist. You promote them manually.',
    emoji: '⏳',
  },
  age_check: {
    label: 'Age Verification',
    description: 'Guest confirms they are 18 or older.',
    emoji: '🔒',
  },
  custom_question: {
    label: 'Custom Question',
    description: 'A yes/no or short-text question the guest must answer.',
    emoji: '💬',
  },
}

let _seq = 0
export function newGate(type: GateType, label?: string): Gate {
  _seq += 1
  return {
    id: `gate-${Date.now()}-${_seq}`,
    type,
    label: label ?? GATE_META[type].label,
    approvalRequired: type === 'application' || type === 'waitlist',
  }
}
