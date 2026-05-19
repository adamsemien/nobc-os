import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-myspace',
  name: 'MySpace — Top 8',
  description: 'Custom profiles, glitter text, auto-play music. 2005.',
  keywords: ['myspace', 'top8', 'scene', 'emo', 'profile', 'glitter', 'retro', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    const isActive = document.documentElement.dataset.theme === 'myspace';
    ctx.setTheme(isActive ? 'nobc' : 'myspace');
    ctx.closeCommandPalette();
  },
});
