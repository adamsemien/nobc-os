import { LegalPage, legalMetadata, type LegalSection } from '@/app/_components/LegalPage';

export const metadata = legalMetadata('Refund Policy');

const sections: LegalSection[] = [
  {
    heading: 'Ticket Sales',
    body: [
      'All ticket sales are final, except where an event is cancelled or rescheduled by No Bad Company. Because our events are curated and capacity-limited, we are unable to offer refunds for change of plans or non-attendance.',
    ],
  },
  {
    heading: 'Event Cancellations',
    body: [
      'If No Bad Company cancels an event, you will receive a full refund to your original payment method. Refunds are typically processed within 5–10 business days, depending on your bank or card issuer.',
    ],
  },
  {
    heading: 'Reschedules',
    body: [
      'If an event is rescheduled, your ticket automatically transfers to the new date. If you cannot attend the new date, you may request a full refund within 14 days of the reschedule announcement.',
    ],
  },
  {
    heading: 'Membership',
    body: [
      'Membership fees are not eligible for refund once member access has been granted, as access takes effect immediately upon approval. If you were charged in error, contact us within 7 days and we will make it right.',
    ],
  },
  {
    heading: 'Non-Member Tickets',
    body: [
      'Guest (non-member) ticket purchases may be refunded if requested within 48 hours of purchase, provided the event has not yet taken place. After this window, non-member tickets follow the standard final-sale policy.',
    ],
  },
  {
    heading: 'Waitlist',
    body: [
      'Joining a waitlist never results in a charge. You are only charged if you are admitted from the waitlist and confirm your spot. If you are not admitted, there is nothing to refund.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      'To request a refund or ask about this policy, email team@thenobadcompany.com with your order details.',
    ],
  },
];

export default function RefundPolicyPage() {
  return <LegalPage title="Refund Policy" sections={sections} />;
}
