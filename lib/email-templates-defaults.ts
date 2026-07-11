/** Default email templates seeded for every new workspace and during /api/dev/seed.
 *
 *  Each `body{Html,Text}` may contain {{handlebars}} variable refs that lib/email.ts
 *  interpolates at send time. `variables` is the list of supported names for the
 *  template, surfaced as quick-insert chips in the Communications editor.
 */

export type DefaultTemplate = {
  key: string;
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: string[];
  enabled: boolean;
};

const SIG = `<br/><br/>No Bad Company`;

export const DEFAULT_EMAIL_TEMPLATES: DefaultTemplate[] = [
  {
    key: 'event.published',
    name: 'New event announcement',
    description: 'Sent to approved members when a new event is published.',
    subject: 'New event: {{event.title}}',
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>We're adding something to the calendar.</p>` +
      `<p><strong>{{event.title}}</strong><br/>{{event.dateFormatted}}<br/>{{event.location}}</p>` +
      `<p>{{event.description}}</p>` +
      `<p><a href="{{event.url}}" style="display:inline-block;background:#B22E21;color:#f9f7f2;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500;">Reserve my spot</a></p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\nWe're adding something to the calendar.\n\n` +
      `{{event.title}}\n{{event.dateFormatted}}\n{{event.location}}\n\n` +
      `{{event.description}}\n\nReserve: {{event.url}}\n\nNo Bad Company`,
    variables: [
      'member.firstName',
      'event.title',
      'event.dateFormatted',
      'event.location',
      'event.description',
      'event.url',
    ],
    enabled: true,
  },
  {
    key: 'rsvp.confirmation',
    name: 'RSVP confirmation',
    description: "Sent after a member RSVPs. Confirms their spot.",
    subject: "You're in: {{event.title}}",
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>You're confirmed for <strong>{{event.title}}</strong>.</p>` +
      `<p>{{event.dateFormatted}}<br/>{{event.timeFormatted}}<br/>{{event.location}}</p>` +
      `<p>Your ticket and QR code are at the link below. Show it at the door and staff will scan you in.</p>` +
      `<p><a href="{{ticket.url}}">{{ticket.url}}</a></p>` +
      `<p>We'll send a reminder the day of.</p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\nYou're confirmed for {{event.title}}.\n\n` +
      `{{event.dateFormatted}}\n{{event.timeFormatted}}\n{{event.location}}\n\n` +
      `Your ticket and QR code: {{ticket.url}}\n\n` +
      `We'll send a reminder the day of.\n\nNo Bad Company`,
    variables: [
      'member.firstName',
      'event.title',
      'event.dateFormatted',
      'event.timeFormatted',
      'event.location',
      'ticket.url',
    ],
    enabled: true,
  },
  {
    key: 'rsvp.confirmation_paid',
    name: 'Ticket confirmation (with door QR)',
    description:
      'Sent after a paid or comp ticket purchase when the buyer has a member QR. Buyers without a QR get the standard RSVP confirmation.',
    subject: "You're in: {{event.title}}",
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>You're confirmed for <strong>{{event.title}}</strong>.</p>` +
      `<p>{{event.dateFormatted}}<br/>{{event.timeFormatted}}<br/>{{event.location}}</p>` +
      `<p>Show this QR code at the door and staff will scan you in:</p>` +
      `<p><img src="{{qr.url}}" alt="Check-in QR code" width="200" height="200" style="border-radius:8px;" /></p>` +
      `<p>Can't load the image? Use this link instead:<br/><a href="{{ticket.url}}">{{ticket.url}}</a></p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\nYou're confirmed for {{event.title}}.\n\n` +
      `{{event.dateFormatted}}\n{{event.timeFormatted}}\n{{event.location}}\n\n` +
      `Show your QR at the door: {{qr.url}}\n\n` +
      `Or use your ticket link: {{ticket.url}}\n\nNo Bad Company`,
    variables: [
      'member.firstName',
      'event.title',
      'event.dateFormatted',
      'event.timeFormatted',
      'event.location',
      'qr.url',
      'ticket.url',
    ],
    enabled: true,
  },
  {
    key: 'event.reminder_upcoming',
    name: 'Upcoming-event reminder',
    description:
      'Sent N days before an event to confirmed RSVPs. Off until reminder.pre_event.enabled is turned on.',
    subject: 'Coming up: {{event.title}}',
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p><strong>{{event.title}}</strong> is coming up.</p>` +
      `<p>{{event.dateFormatted}}<br/>{{event.timeFormatted}}<br/>{{event.location}}</p>` +
      `<p>We'll send one more reminder the day of. See you there.</p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\n{{event.title}} is coming up.\n\n` +
      `{{event.dateFormatted}}\n{{event.timeFormatted}}\n{{event.location}}\n\n` +
      `We'll send one more reminder the day of. See you there.\n\nNo Bad Company`,
    variables: [
      'member.firstName',
      'event.title',
      'event.dateFormatted',
      'event.timeFormatted',
      'event.location',
    ],
    enabled: true,
  },
  {
    key: 'event.reminder',
    name: 'Day-of reminder',
    description: 'Sent the morning of an event to confirmed RSVPs.',
    subject: 'Tonight: {{event.title}}',
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>Tonight is the night.</p>` +
      `<p><strong>{{event.title}}</strong><br/>{{event.timeFormatted}}<br/>{{event.location}}</p>` +
      `<p>See you there.</p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\nTonight is the night.\n\n` +
      `{{event.title}}\n{{event.timeFormatted}}\n{{event.location}}\n\nSee you there.\n\nNo Bad Company`,
    variables: ['member.firstName', 'event.title', 'event.timeFormatted', 'event.location'],
    enabled: true,
  },
  {
    key: 'application.approved',
    name: 'Application approved',
    description: 'Welcome email when an application is approved.',
    subject: 'Welcome to No Bad Company',
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>You're in.</p>` +
      `<p>What that means: you'll start hearing about gatherings before anyone else. Some are open. Some are application-only. All of them are built around the right people in the right room.</p>` +
      `<p><a href="{{site.url}}/m/events">See what's coming up →</a></p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\nYou're in.\n\nYou'll start hearing about gatherings before anyone else. Some open, some application-only. All built around the right people in the right room.\n\nUpcoming: {{site.url}}/m/events\n\nNo Bad Company`,
    variables: ['member.firstName', 'site.url'],
    enabled: true,
  },
  {
    key: 'application.rejected',
    name: 'Application not advanced',
    description: 'Disabled by default. Operator must opt in.',
    subject: 'About your application',
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>Thank you for applying to No Bad Company. After review, we're not moving forward at this time.</p>` +
      `<p>This is more about timing and fit than anything else. We wish you well.</p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\nThank you for applying to No Bad Company. After review, we're not moving forward at this time.\n\nThis is more about timing and fit than anything else. We wish you well.\n\nNo Bad Company`,
    variables: ['member.firstName'],
    enabled: false,
  },
  {
    key: 'event.followup',
    name: 'Post-event thank you',
    description:
      'Sent the day after an event to checked-in attendees. Off until followup.enabled is turned on.',
    subject: 'Good to see you at {{event.title}}',
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>Thank you for being part of <strong>{{event.title}}</strong>. Rooms like that only happen because of who shows up.</p>` +
      `<p>We'll be in touch about what comes next.</p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\nThank you for being part of {{event.title}}. Rooms like that only happen because of who shows up.\n\n` +
      `We'll be in touch about what comes next.\n\nNo Bad Company`,
    variables: ['member.firstName', 'event.title'],
    enabled: true,
  },
  {
    key: 'walkin.welcome',
    name: 'Walk-in welcome',
    description: 'Sent when an operator checks in a walk-in guest.',
    subject: 'Welcome to {{event.title}}',
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>Glad you made it tonight.</p>` +
      `<p>This is your record for the evening. We'll be in touch about what comes next.</p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\nGlad you made it tonight.\n\nThis is your record for the evening. We'll be in touch about what comes next.\n\nNo Bad Company`,
    variables: ['member.firstName', 'event.title'],
    enabled: true,
  },
  {
    key: 'sponsor.survey_invite',
    name: 'Sponsor brand-lift survey',
    description: 'Pre/post survey invite that measures brand lift for a sponsored event.',
    subject: 'A quick word on {{event.title}}',
    bodyHtml:
      `<p>{{member.firstName}},</p>` +
      `<p>{{survey.intro}}</p>` +
      `<p>It takes under a minute and stays anonymous in anything we share.</p>` +
      `<p><a href="{{survey.url}}" style="display:inline-block;background:#B22E21;color:#f9f7f2;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500;">{{survey.cta}}</a></p>` +
      SIG,
    bodyText:
      `{{member.firstName}},\n\n{{survey.intro}}\n\nIt takes under a minute and stays anonymous in anything we share.\n\n{{survey.cta}}: {{survey.url}}\n\nNo Bad Company`,
    variables: ['member.firstName', 'event.title', 'survey.intro', 'survey.cta', 'survey.url'],
    enabled: true,
  },
];

export type DefaultSetting = {
  key: string;
  value: string;
  type: 'boolean' | 'time' | 'text';
  description: string;
};

export const DEFAULT_PLATFORM_SETTINGS: DefaultSetting[] = [
  { key: 'reminder.send_time_utc', value: '15:00', type: 'time', description: 'Time of day reminders are sent (UTC).' },
  { key: 'reminder.enabled', value: 'true', type: 'boolean', description: 'Master switch for day-of reminders.' },
  { key: 'event.notify_on_publish', value: 'true', type: 'boolean', description: 'Email approved members when an event publishes.' },
  { key: 'rsvp.send_confirmation', value: 'true', type: 'boolean', description: 'Send a confirmation email on RSVP.' },
  { key: 'reminder.pre_event.enabled', value: 'false', type: 'boolean', description: 'Send an upcoming-event reminder N days before each event.' },
  { key: 'reminder.pre_event.days_before', value: '3', type: 'text', description: 'How many days before an event the upcoming reminder sends (1-30).' },
  { key: 'followup.enabled', value: 'false', type: 'boolean', description: 'Send a post-event thank-you to checked-in attendees the day after an event.' },
];
