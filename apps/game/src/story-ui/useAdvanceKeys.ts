import { useEffect } from 'react';
import { isAdvanceKey } from './advance';

/**
 * Listens for the advance keys only while `active`. When inactive no listener exists, so a closed
 * dialogue can never steal a key from the game.
 */
export function useAdvanceKeys(active: boolean, onAdvance: () => void): void {
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isAdvanceKey(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      onAdvance();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, onAdvance]);
}
