import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-darkroom',
  name: 'Switch to Darkroom',
  description: 'Safelight on. True blacks for late-night review.',
  keywords: ['dark', 'red', 'safelight', 'photo', 'night', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('darkroom');
    ctx.closeCommandPalette();
  },
});
