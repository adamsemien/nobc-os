import { Ban } from 'lucide-react';
import { registerCommand } from '../registry';

registerCommand({
  id: 'action.add-blocked-list',
  name: 'Add to Blocked list',
  description: 'Auto-reject matching applicants',
  keywords: ['block', 'reject', 'deny'],
  group: 'action',
  icon: Ban,
  execute: (ctx) => {
    ctx.router.push('/operator/settings/lists');
    ctx.closeCommandPalette();
  },
});
