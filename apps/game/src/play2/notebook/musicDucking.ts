import { useEffect } from 'react';

const owners = new Set<symbol>();
const listeners = new Set<() => void>();
const notify = (): void => { for (const listener of listeners) listener(); };
export const notebookDucking = {
  getSnapshot: (): boolean => owners.size > 0,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
export function useNotebookDucking(visible: boolean): void {
  useEffect(() => {
    if (!visible) return;
    const owner = Symbol();
    owners.add(owner); notify();
    return () => { owners.delete(owner); notify(); };
  }, [visible]);
}
