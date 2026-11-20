import { useEffect, useState } from 'preact/hooks';

/** Server-corrected clock so countdowns are right even when the phone's clock is wrong. */
let offset = 0;
export function syncClock(serverNowIso: string) {
  offset = Date.parse(serverNowIso) - Date.now();
}
export const now = () => Date.now() + offset;

export function useCountdown(targetIso: string | undefined, onDone?: () => void): string {
  const target = targetIso ? Date.parse(targetIso) : 0;
  const [left, setLeft] = useState(() => Math.max(0, target - now()));
  useEffect(() => {
    if (!target) return;
    let fired = false;
    const tick = () => {
      const l = Math.max(0, target - now());
      setLeft(l);
      if (l === 0 && !fired) { fired = true; onDone?.(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
