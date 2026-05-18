import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-nobc',
  name: 'Switch to Light',
  keywords: ['default', 'day', 'bright', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('nobc');
    ctx.closeCommandPalette();
  },
});
