'use client';

import { useState, useEffect } from 'react';
import { useTheme } from './ThemeToggle';

const BLINKIES = ['✨ NoBC ✨', 'emo', 'scene', '💀 hardcore', 'indie kid', '🖤 post-ironic'];

const NOW_PLAYING = '🎵 Fall Out Boy — Sugar We\'re Goin Down';

export function MyspaceEasterEgg() {
  const { theme } = useTheme();
  const [views] = useState(() => 1337 + Math.floor(Math.random() * 100));
  const [nowPlayingVisible, setNowPlayingVisible] = useState(true);

  useEffect(() => {
    if (theme === 'myspace') setNowPlayingVisible(true);
  }, [theme]);

  if (theme !== 'myspace') return null;

  return (
    <>
      {/* Now playing banner */}
      {nowPlayingVisible && (
        <div
          className="ms-now-playing"
          role="complementary"
          aria-label="Currently playing"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}
        >
          <span className="ms-now-playing-text">{NOW_PLAYING}</span>
          <button
            className="ms-now-playing-close"
            onClick={() => setNowPlayingVisible(false)}
            aria-label="Dismiss now playing"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bottom bar: blinkies + profile view counter */}
      <div
        className="ms-footer-bar"
        aria-hidden="true"
        style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998 }}
      >
        <div className="ms-blinkies">
          {BLINKIES.map((b) => (
            <span key={b} className="ms-blinkie">{b}</span>
          ))}
        </div>
        <span className="ms-view-counter">
          Profile Views: <strong>{views.toLocaleString()}</strong>
        </span>
      </div>
    </>
  );
}
