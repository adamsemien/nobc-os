import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-midnight',
  name: 'Switch to Midnight',
  keywords: ['dark', 'night', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('midnight');
    ctx.closeCommandPalette();
  },
});
