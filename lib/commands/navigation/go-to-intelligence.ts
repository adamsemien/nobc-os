import { registerCommand } from '../registry';

registerCommand({
  id: 'navigation.intelligence',
  name: 'Go to Intelligence',
  description: 'Community, insights, and trends dashboard',
  keywords: ['analytics', 'metrics', 'data'],
  group: 'navigation',
  execute: (ctx) => {
    ctx.router.push('/operator/intelligence');
    ctx.closeCommandPalette();
  },
});
