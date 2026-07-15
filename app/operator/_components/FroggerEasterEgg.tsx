'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// FroggerGame touches window/canvas, so load it client-only (mirrors /apply).
const FroggerGame = dynamic(() => import('@/app/apply/_components/FroggerGame'), { ssr: false });

/**
 * South Congress Frogger. The game also lives in the /apply form (type "frogger"
 * with focus outside a text field). Mounted globally in the operator layout so the
 * DevToolbar egg menu can launch it in place via FROGGER_PLAY_EVENT — every other
 * egg has a one-click "play"; Frogger previously only linked to /apply, which
 * dead-ends once you've already applied.
 */
export const FROGGER_PLAY_EVENT = 'nobc:play-frogger';

export function FroggerEasterEgg() {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const onPlay = () => setPlaying(true);
    window.addEventListener(FROGGER_PLAY_EVENT, onPlay);
    return () => window.removeEventListener(FROGGER_PLAY_EVENT, onPlay);
  }, []);

  if (!playing) return null;

  return <FroggerGame onClose={() => setPlaying(false)} />;
}
