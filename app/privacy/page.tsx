import { LegalPage, legalMetadata, type LegalSection } from '@/app/_components/LegalPage';

export const metadata = legalMetadata('Privacy Policy');

const sections: LegalSection[] = [
  {
    heading: 'Information We Collect',
    body: ['No Bad Company collects only the information needed to operate membership and events:'],
    bullets: [
      'Your name, email address, and phone number.',
      'The responses you provide in your membership application.',
      'Payment information, processed and held by Stripe — we do not store full card numbers.',
      'Event check-in data, including time and location of entry.',
      'SMS consent status and message history, where you have opted in.',
    ],
  },
  {
    heading: 'How We Use It',
    body: [
      'We use your information to review applications, administer membership, coordinate events, process payments, send communications you have consented to, and improve the experience of the community.',
    ],
  },
  {
    heading: 'We Do Not Sell Your Data',
    body: [
      'We do not sell your personal data to third parties. We do not rent, trade, or share it for advertising. Your application responses are read only by the NoBC membership team.',
    ],
  },
  {
    heading: 'Third-Party Processors',
    body: ['We rely on a small number of trusted processors to operate the platform:'],
    bullets: [
      'Stripe — payment processing.',
      'Resend — transactional email delivery.',
      'Clerk — account authentication.',
      'Twilio — SMS delivery (accessed via our Runtype communications layer).',
    ],
  },
  {
    heading: 'SMS Communications',
    body: [
      'SMS messages are sent only with your separate, affirmative consent. You may opt out at any time by replying STOP to any message. We retain a record of consent and opt-out status to honor your preferences.',
    ],
  },
  {
    heading: 'Data Retention',
    body: [
      'We retain your information for 24 months following your most recent application or the termination of your membership, whichever is later. Certain records may be kept longer where required by law.',
    ],
  },
  {
    heading: 'Your Rights',
    body: [
      'You may request access to, correction of, or deletion of your personal data by emailing team@thenobadcompany.com. We will honor verified requests promptly.',
    ],
    bullets: [
      'GDPR: if you are in the EU/EEA, you have the right to access, rectify, erase, restrict, and port your data, and to object to processing.',
      'CCPA: if you are a California resident, you have the right to know what we collect, to request deletion, and not to be discriminated against for exercising these rights.',
    ],
  },
  {
    heading: 'Cookies',
    body: [
      'We use only essential cookies required for authentication and basic site function. We do not use advertising or third-party tracking cookies.',
    ],
  },
  {
    heading: 'Contact',
    body: ['For any privacy request or question, email team@thenobadcompany.com.'],
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" sections={sections} />;
}
