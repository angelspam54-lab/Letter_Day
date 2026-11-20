import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { LABEL, LETTERS, TIER_LABEL, type Category, type Tier } from '../../../shared/game';
import { CATEGORY_COLOR } from '../../../shared/palette';

/** The game's mark: an ink tile holding a single letter. */
export function LetterTile({ letter, size = 'md', ghost = false }: { letter: string; size?: 'sm' | 'md' | 'lg' | 'xl'; ghost?: boolean }) {
  return <span class={`tile ${size} ${ghost ? 'ghost' : ''}`} aria-label={`Letter ${letter}`}>{letter}</span>;
}

/** Slot-machine reveal: letters tick past, slowing down, then land on the real one. */
export function LetterSpinner({ letter, duration = 2200, size = 'xl' }: { letter: string; duration?: number; size?: 'lg' | 'xl' }) {
  const [shown, setShown] = useState(LETTERS[0]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(letter); setDone(true); return; }
    let t = 0;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const progress = t / duration;
      if (progress >= 1) { setShown(letter); setDone(true); return; }
      setShown(LETTERS[(i++ * 7) % LETTERS.length]);
      const step = 45 + progress * progress * 260;
      t += step;
      timer = setTimeout(tick, step);
    };
    tick();
    return () => clearTimeout(timer);
  }, [letter]);
  return <span class={`tile ${size} spinner ${done ? 'landed' : ''}`} aria-live="polite" aria-label={done ? `Letter ${letter}` : 'Choosing a letter'}>{shown}</span>;
}

export function CatChip({ category, small = false }: { category: Category; small?: boolean }) {
  return <span class={`cat-chip ${small ? 'sm' : ''}`} style={{ '--c': CATEGORY_COLOR[category] } as any}><i />{LABEL[category]}</span>;
}

export function TierPill({ tier, category, pct }: { tier: Tier; category: Category; pct?: number }) {
  const strong = tier === 'only' || tier === 'rare' || tier === 'uncommon' || tier === 'common';
  return (
    <span class={`tier t-${tier}`} style={strong ? ({ '--c': CATEGORY_COLOR[category] } as any) : undefined}>
      {tier === 'only' ? '★ ' : ''}{TIER_LABEL[tier]}{strong && tier !== 'only' && pct !== undefined ? ` · ${pct}%` : ''}
    </span>
  );
}

/** The six category colours as a strip: the share signature (filled = how rare). */
export function TierStrip({ tiers, categories }: { tiers: Tier[]; categories: Category[] }) {
  const weight: Record<Tier, number> = { only: 1, rare: 0.85, uncommon: 0.6, common: 0.38, pending: 0, miss: 0 };
  return (
    <span class="tier-strip" aria-hidden="true">
      {tiers.map((t, i) => <i key={i} class={`t-${t}`} style={{ '--c': CATEGORY_COLOR[categories[i]], '--w': weight[t] } as any} />)}
    </span>
  );
}

export function Stat({ value, label }: { value: ComponentChildren; label: string }) {
  return <div class="stat"><b>{value}</b><span>{label}</span></div>;
}

export const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const AVATAR = ['#e9573f', '#3f9152', '#2f7fc8', '#7a5bd0', '#e38a1d', '#c49a12', '#c2477a', '#178a8a'];
export const avatarColor = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR[h % AVATAR.length]; };
export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return <span class="avatar" style={{ background: avatarColor(id), width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.4}px` }} aria-hidden="true">{initials(name)}</span>;
}

export function formatDate(d: string, long = false) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
