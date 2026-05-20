import { registerCommand } from '../registry';

registerCommand({
  id: 'navigation.lists',
  name: 'Go to Lists',
  description: 'Purple + Blocked lists',
  keywords: ['watch', 'vip', 'block'],
  group: 'navigation',
  execute: (ctx) => {
    ctx.router.push('/operator/settings/lists');
    ctx.closeCommandPalette();
  },
});
