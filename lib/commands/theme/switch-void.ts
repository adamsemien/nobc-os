import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-void',
  name: 'Switch to Void',
  keywords: ['black', 'red', 'syne', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('void');
    ctx.closeCommandPalette();
  },
});
