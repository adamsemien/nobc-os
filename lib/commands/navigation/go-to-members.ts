import { registerCommand } from '../registry';

registerCommand({
  id: 'navigation.members',
  name: 'Go to Members',
  description: 'Approved member directory',
  keywords: ['people', 'roster'],
  group: 'navigation',
  execute: (ctx) => {
    ctx.router.push('/operator/members');
    ctx.closeCommandPalette();
  },
});
