import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-ember',
  name: 'Switch to Ember',
  keywords: ['amber', 'brown', 'warm', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('ember');
    ctx.closeCommandPalette();
  },
});
