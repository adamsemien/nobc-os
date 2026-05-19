import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-y2k',
  name: 'Switch to Y2K — beta 0.99',
  keywords: ['y2k', 'pink', 'comic sans', 'aim', 'xanga', 'livejournal', 'retro', 'beta', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    ctx.setTheme('y2k');
    ctx.closeCommandPalette();
  },
});
