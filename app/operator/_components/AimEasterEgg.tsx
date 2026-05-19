'use client';

import { useState, useEffect } from 'react';
import { useTheme } from './ThemeToggle';

const RUNNING_MAN = `
 o/
/|
/ \\`.trim();

export function AimEasterEgg() {
  const { theme } = useTheme();
  const [awayVisible, setAwayVisible] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  // Reset away banner each time AIM is activated
  useEffect(() => {
    if (theme === 'aim') setAwayVisible(true);
  }, [theme]);

  if (theme !== 'aim') return null;

  return (
    <>
      {/* Away message banner */}
      {awayVisible && (
        <div
          className="aim-away-banner"
          role="banner"
          aria-label="Away message"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}
        >
          <span className="aim-away-icon" aria-hidden="true">🏃</span>
          <span className="aim-away-text">
            <strong>Adam</strong> is away:{' '}
            <em>building NoBC OS brb</em>
          </span>
          <button
            className="aim-away-close"
            onClick={() => setAwayVisible(false)}
            aria-label="Dismiss away message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bottom-right: running man + sound toggle */}
      <div
        className="aim-corner"
        aria-hidden="true"
        style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9998 }}
      >
        <pre className="aim-running-man">{RUNNING_MAN}</pre>
        <button
          className="aim-sound-toggle"
          onClick={() => setSoundOn((v) => !v)}
          title={soundOn ? 'Sounds: On' : 'Sounds: Off'}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>
    </>
  );
}
