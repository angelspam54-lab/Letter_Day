import type { DailyResult, Tier } from '../../../shared/types';

/** Spoiler-free: shares how rare your answers were, never the answers. */
const TIER_EMOJI: Record<Tier, string> = { only: '💎', rare: '🔥', uncommon: '✨', common: '✅', pending: '❔', miss: '❌' };

export function shareText(r: DailyResult): string {
  const tiers = r.answers.map((a) => TIER_EMOJI[a.tier]).join('');
  const brag = r.percentile !== null && r.percentile >= 50 && r.players > 4 ? ` · top ${Math.max(1, 100 - r.percentile)}%` : '';
  const streak = r.streak > 1 ? ` · 🔥${r.streak}` : '';
  return `Letter Day #${r.number} · ${r.letter}\n${tiers}\n${r.score} pts${brag}${streak}\n${location.origin}/r/${r.shareId}`;
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export async function shareOrCopy(text: string, imageUrl?: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share) {
    try {
      if (imageUrl) {
        const blob = await (await fetch(imageUrl)).blob();
        const file = new File([blob], 'letter-day.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return 'shared'; }
      }
      await navigator.share({ text });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copy(text)) ? 'copied' : 'failed';
}

export async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** The Clue: 🟩 first try, 🟨 solved with extra tries or hints, 🟥 missed; 🧩 if the theme was found. */
export function clueShareText(d: import('../../../shared/types').ClueDay): string {
  const row = d.clues.map((c) => (!c.solved ? '🟥' : c.guesses.length === 1 && c.hints === 0 ? '🟩' : '🟨')).join('');
  return `Letter Day · The Clue #${d.number} (${d.letter})\n${row} ${d.theme.solved ? '🧩' : '❓'}\n${d.score} pts\n${location.origin}/?play=clue`;
}

/** The Ladder: one square per step (🟨 gold word, 🟩 the top), no words given away. */
export function ladderShareText(d: import('../../../shared/types').LadderDay): string {
  const row = d.rungs.slice(1).map((r, i, a) => (i === a.length - 1 ? '🟩' : r.gold ? '🟨' : '⬜')).join('');
  const gold = d.rungs.filter((r) => r.gold).length;
  return `Letter Day · The Ladder #${d.number}\n🪜 ${d.steps} steps (par ${d.par})${gold ? ` · ${gold} gold` : ''}\n${row}\n${d.score} pts\n${location.origin}/?play=ladder`;
}
