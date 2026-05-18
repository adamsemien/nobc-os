import { registerCommand } from '../registry';

registerCommand({
  id: 'navigation.webhooks',
  name: 'Go to Webhooks',
  description: 'Webhook integrations',
  keywords: ['integrations', 'svix'],
  group: 'navigation',
  execute: (ctx) => {
    ctx.router.push('/operator/settings/webhooks');
    ctx.closeCommandPalette();
  },
});
