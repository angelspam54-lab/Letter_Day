import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { IconClose } from './Icons';
import { CatChip, LetterTile } from './Bits';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div class="sheet-head"><h2>{title}</h2><button class="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button></div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="How to play" onClose={onClose}>
      <div class="how-hero"><LetterTile letter="K" size="lg" /><p>Everyone gets the <b>same letter</b> each day. You have <b>60 seconds</b> to fill in:</p></div>
      <div class="how-cats"><CatChip category="name" /><CatChip category="animal" /><CatChip category="place" /><CatChip category="thing" /><CatChip category="food" /><span class="cat-chip bonus"><i />+ a daily bonus</span></div>
      <h3>Rare answers score more</h3>
      <ul class="how-tiers">
        <li><span class="tier t-only" style={{ '--c': '#7a5bd0' } as any}>★ Only you</span> nobody else said it · 30</li>
        <li><span class="tier t-rare" style={{ '--c': '#2f7fc8' } as any}>Rare</span> under 10% of players · 20</li>
        <li><span class="tier t-uncommon" style={{ '--c': '#3f9152' } as any}>Uncommon</span> under 30% · 15</li>
        <li><span class="tier t-common" style={{ '--c': '#e38a1d' } as any}>Common</span> everyone thought of it · 10</li>
      </ul>
      <p class="muted small">Finishing early earns up to 15 bonus points. Answers we don't recognise are <b>pending</b>: they count once other players give them too, or when your group votes them in. Your score can change through the day as more people play.</p>
      <h3>Play with friends</h3>
      <p><b>Groups</b>: share a link, everyone plays the daily letter, then compare answers side by side and vote on the doubtful ones.</p>
      <p><b>Party Room</b>: play live. The first person to fill every box calls <b>STOP!</b> and everyone's time is up. Unique answers score 10, shared ones 5.</p>
      <button class="btn primary block" onClick={onClose}>Got it</button>
    </Sheet>
  );
}
