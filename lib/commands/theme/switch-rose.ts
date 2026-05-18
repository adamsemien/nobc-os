import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-rose',
  name: 'Switch to Rosé',
  keywords: ['terracotta', 'pink', 'warm', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('rose');
    ctx.closeCommandPalette();
  },
});
