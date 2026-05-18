import { registerCommand } from '../registry';

registerCommand({
  id: 'navigation.events',
  name: 'Go to Events',
  description: 'Event calendar and registrations',
  keywords: ['calendar', 'rsvps'],
  group: 'navigation',
  execute: (ctx) => {
    ctx.router.push('/operator/events');
    ctx.closeCommandPalette();
  },
});
