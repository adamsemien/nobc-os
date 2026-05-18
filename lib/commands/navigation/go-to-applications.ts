import { registerCommand } from '../registry';

registerCommand({
  id: 'navigation.applications',
  name: 'Go to Applications',
  description: 'Application review queue',
  keywords: ['queue', 'apps', 'review'],
  group: 'navigation',
  execute: (ctx) => {
    ctx.router.push('/operator/applications');
    ctx.closeCommandPalette();
  },
});
