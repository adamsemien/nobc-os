import { LegalPage, legalMetadata, type LegalSection } from '@/app/_components/LegalPage';

export const metadata = legalMetadata('Terms of Service');

const sections: LegalSection[] = [
  {
    heading: 'About Us',
    body: [
      'No Bad Company ("NoBC," "we," "us") is an Austin, Texas-based events and membership organization. We operate a curated members club and produce in-person events. These Terms of Service govern your use of our website, application platform, event registration, and membership.',
      'By submitting an application, registering for an event, or purchasing a ticket, you agree to these terms.',
    ],
  },
  {
    heading: 'Events & Tickets',
    body: [
      'Tickets and event registrations are issued to a named individual and are non-transferable. Entry is verified at the door by QR code. We reserve the right to refuse entry to any person at our sole discretion, including for conduct, capacity, or safety reasons.',
    ],
    bullets: [
      'Each ticket admits one named guest unless otherwise stated.',
      'You must present a valid QR code for check-in.',
      'We may photograph or record events; attendance constitutes consent unless you opt out per event.',
    ],
  },
  {
    heading: 'Membership',
    body: [
      'Membership in No Bad Company is by application only. Approval is discretionary and is not guaranteed by submission, payment, or referral. We may decline, waitlist, or hold any application without obligation to provide a reason.',
      'Membership may be revoked at any time for conduct inconsistent with our community standards, with or without refund, at our discretion.',
    ],
  },
  {
    heading: 'Payments',
    body: [
      'Payments for tickets and membership are processed in U.S. dollars through Stripe, our payment processor. We do not store full payment card details on our systems. By providing payment information, you authorize the applicable charge and agree to Stripe’s terms and our Refund Policy.',
    ],
  },
  {
    heading: 'SMS Messaging',
    body: [
      'NoBC may send SMS/text messages for event coordination and member communication only with your separate, affirmative consent. Our member hotline is 737-727-4222. Message and data rates may apply, and message frequency varies.',
    ],
    bullets: [
      'Reply STOP to any message to opt out of SMS at any time.',
      'Reply HELP for assistance, or contact team@thenobadcompany.com.',
      'Carriers are not liable for delayed or undelivered messages.',
    ],
  },
  {
    heading: 'Community Standards',
    body: [
      'No Bad Company is built on trust and good conduct. Members and guests are expected to treat one another, our staff, and our venues with respect. Harassment, discrimination, and behavior that endangers others are grounds for removal and revocation of membership.',
    ],
  },
  {
    heading: 'Intellectual Property',
    body: [
      'All NoBC branding, content, written materials, and platform software are the property of No Bad Company and may not be copied, reproduced, or used without our written permission.',
    ],
  },
  {
    heading: 'Limitation of Liability',
    body: [
      'To the fullest extent permitted by law, No Bad Company is not liable for any indirect, incidental, or consequential damages arising from your use of our platform, attendance at events, or membership. Events are attended at your own risk.',
    ],
  },
  {
    heading: 'Governing Law',
    body: [
      'These terms are governed by the laws of the State of Texas. Any dispute arising under them shall be resolved in the state or federal courts located in Travis County, Texas.',
    ],
  },
  {
    heading: 'Contact',
    body: ['Questions about these terms? Email us at team@thenobadcompany.com.'],
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms of Service" sections={sections} />;
}
