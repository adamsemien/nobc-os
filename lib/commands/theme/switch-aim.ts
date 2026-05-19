import { registerCommand } from '../registry';

registerCommand({
  id: 'theme.switch-aim',
  name: 'AIM — You\'ve Got Mail',
  description: 'AOL Instant Messenger, circa 2001',
  keywords: ['aim', 'aol', 'instant', 'messenger', 'buddy', 'away', 'retro', 'windows', 'theme'],
  group: 'theme',
  execute: (ctx) => {
    const isActive = document.documentElement.dataset.theme === 'aim';
    ctx.setTheme(isActive ? 'nobc' : 'aim');
    ctx.closeCommandPalette();

    // Door creak: synthesized via Web Audio API — no file imports
    if (!isActive && typeof window !== 'undefined' && window.AudioContext) {
      try {
        const ac = new window.AudioContext();
        const t = ac.currentTime;

        // Low rumble oscillator (the door mass)
        const rumble = ac.createOscillator();
        rumble.type = 'sawtooth';
        rumble.frequency.setValueAtTime(80, t);
        rumble.frequency.exponentialRampToValueAtTime(40, t + 0.6);

        // High squeak oscillator (the hinge)
        const squeak = ac.createOscillator();
        squeak.type = 'sine';
        squeak.frequency.setValueAtTime(600, t + 0.05);
        squeak.frequency.exponentialRampToValueAtTime(220, t + 0.55);

        // Creak modulator
        const mod = ac.createOscillator();
        mod.type = 'sine';
        mod.frequency.setValueAtTime(14, t);
        mod.frequency.linearRampToValueAtTime(4, t + 0.6);
        const modGain = ac.createGain();
        modGain.gain.setValueAtTime(30, t);
        mod.connect(modGain);
        modGain.connect(squeak.frequency);

        const rumbleGain = ac.createGain();
        rumbleGain.gain.setValueAtTime(0.18, t);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

        const squeakGain = ac.createGain();
        squeakGain.gain.setValueAtTime(0.0, t);
        squeakGain.gain.linearRampToValueAtTime(0.12, t + 0.08);
        squeakGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

        rumble.connect(rumbleGain);
        squeak.connect(squeakGain);
        rumbleGain.connect(ac.destination);
        squeakGain.connect(ac.destination);

        [rumble, squeak, mod].forEach((o) => o.start(t));
        [rumble, squeak, mod].forEach((o) => o.stop(t + 0.75));

        setTimeout(() => ac.close(), 900);
      } catch {
        // Web Audio not available — silent
      }
    }
  },
});
