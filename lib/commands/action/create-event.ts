import { CalendarPlus } from 'lucide-react';
import { registerCommand } from '../registry';

registerCommand({
  id: 'action.create-event',
  name: 'Create event',
  description: 'Describe it in plain English - or just name it',
  keywords: ['new', 'event', 'add', 'compose'],
  group: 'action',
  icon: CalendarPlus,
  execute: (ctx) => {
    ctx.router.push('/operator/events/new');
    ctx.closeCommandPalette();
  },
});
