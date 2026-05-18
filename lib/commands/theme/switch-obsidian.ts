import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-obsidian',
  name: 'Switch to Obsidian',
  keywords: ['gold', 'aged', 'cormorant', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('obsidian');
    ctx.closeCommandPalette();
  },
});
