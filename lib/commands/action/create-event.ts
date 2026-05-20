import { CalendarPlus } from 'lucide-react';
import { registerCommand } from '../registry';

registerCommand({
  id: 'action.create-event',
  name: 'Create event',
  description: 'Open the new-event form',
  keywords: ['new', 'event', 'add'],
  group: 'action',
  icon: CalendarPlus,
  execute: (ctx) => {
    ctx.router.push('/operator/events/new');
    ctx.closeCommandPalette();
  },
});
