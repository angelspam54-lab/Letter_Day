import { useEffect, useState } from 'preact/hooks';

let deferred: any = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  listeners.forEach((l) => l());
});
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 'prompt' = Android/desktop install button; 'ios' = show Add-to-Home-Screen hint; null = nothing to offer. */
export function useInstall(): { kind: 'prompt' | 'ios' | null; install: () => Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (isStandalone()) return { kind: null, install: async () => {} };
  if (deferred) {
    return {
      kind: 'prompt',
      install: async () => { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; force((n) => n + 1); },
    };
  }
  return { kind: isIOS() ? 'ios' : null, install: async () => {} };
}
