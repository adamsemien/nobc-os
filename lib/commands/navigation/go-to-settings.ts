import { registerCommand } from '../registry';

registerCommand({
  id: 'navigation.settings',
  name: 'Go to Settings',
  description: 'Workspace settings',
  keywords: ['config', 'workspace'],
  group: 'navigation',
  execute: (ctx) => {
    ctx.router.push('/operator/settings');
    ctx.closeCommandPalette();
  },
});
