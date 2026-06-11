import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-editorial',
  name: 'Switch to Editorial',
  keywords: ['editorial', 'riso', 'print', 'magazine', 'paper', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('editorial');
    ctx.closeCommandPalette();
  },
});
