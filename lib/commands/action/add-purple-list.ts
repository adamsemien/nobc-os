import { Star } from 'lucide-react';
import { registerCommand } from '../registry';

registerCommand({
  id: 'action.add-purple-list',
  name: 'Add to Purple list',
  description: 'Auto-approve a future applicant',
  keywords: ['vip', 'purple', 'auto', 'approve'],
  group: 'action',
  icon: Star,
  execute: (ctx) => {
    ctx.router.push('/operator/settings/lists');
    ctx.closeCommandPalette();
  },
});
