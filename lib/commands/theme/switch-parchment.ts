import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-parchment',
  name: 'Switch to Parchment',
  keywords: ['paper', 'fraunces', 'cream', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('parchment');
    ctx.closeCommandPalette();
  },
});
