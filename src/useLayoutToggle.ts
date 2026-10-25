import { useEffect, useState } from 'react';

export function useLayoutToggle(name: string) {
  const key = `gitlane.layout.v1.${name}`;
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(enabled));
    } catch {
      // Layout controls remain usable when storage is unavailable.
    }
  }, [key, enabled]);
  return [enabled, setEnabled] as const;
}
