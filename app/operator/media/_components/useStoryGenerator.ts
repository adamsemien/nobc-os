/**
 * Hook to manage the story generator panel state and integration.
 * Used in MediaToolbar to add Instagram Story generation capabilities.
 */

'use client';

import { useState } from 'react';

export function useStoryGeneratorPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}
