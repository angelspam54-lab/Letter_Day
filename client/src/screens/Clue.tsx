import { useEffect, useRef, useState } from 'preact/hooks';
import type { ClueDay, CluePublic } from '../../../shared/types';
import { CLUE_TRIES, HINT_COST, NUDGE_COST, THEME_POINTS, THEME_TRIES } from '../../../shared/clue';
import { CATEGORY_COLOR } from '../../../shared/palette';
import type { App } from '../App';
import { TopBar } from '../components/TopBar';
import { LetterTile } from '../components/Bits';
import { IconCheck, IconClose, IconCopy, IconShare, IconWhatsApp } from '../components/Icons';
import { toast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { fx } from '../lib/fx';
import { clueShareText, copy, shareOrCopy, whatsappUrl } from '../lib/share';

const colorOf = (cat: string) => (CATEGORY_COLOR as Record<string, string>)[cat] ?? '#c49a12';

/** Letter blanks as tiles; spaces become gaps. */
export function Blanks({ mask, tone }: { mask: string; tone?: 'good' | 'bad' }) {
  return (
    <span class={`blanks ${tone ?? ''}`} aria-label={mask.replace(/_/g, ' blank ')}>
      {mask.split(' ').map((word, w) => (
        <span class="bw" key={w}>{word.split('').map((ch, i) => <i key={i} class={ch === '_' ? '' : 'on'}>{ch === '_' ? '' : ch}</i>)}</span>
      ))}
    </span>
  );
}

export function Clue({ app }: { app: App }) {
  const [d, setD] = useState<ClueDay | null>(app.clue);
  const [open, setOpen] = useState<number | 'theme' | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.clue().then((x) => { setD(x); app.setClue(x); setOpen(firstOpen(x)); }).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load the clues'));
  }, []);
  const update = (x: ClueDay) => { setD(x); app.setClue(x); };

  if (!d) return <div class="screen"><TopBar app={app} back={() => app.go('home')} title="The Clue" /><div class="center-msg"><p class="muted">{err || 'Loading today\'s clues…'}</p></div></div>;
  const solved = d.clues.filter((c) => c.solved).length;

  return (
    <div class="screen">
      <TopBar app={app} back={() => app.go('home')} title={`The Clue #${d.number}`} />
      <main class="page clue-page">
        <header class="clue-head">
          <LetterTile letter={d.letter} size="lg" />
          <div>
            <h1 class="h2">Six clues. One letter. One hidden theme.</h1>
            <p class="small muted">Every answer starts with {d.letter}. You get {CLUE_TRIES} guesses, and each wrong guess shows another letter. Then work out what links them.</p>
          </div>
        </header>
        <div class="clue-progress" aria-label={`${solved} of 6 solved, ${d.score} points`}>
          {d.clues.map((c) => <i key={c.index} class={c.done ? (c.solved ? 'ok' : 'no') : ''} style={{ '--c': colorOf(c.category) } as any} />)}
          <i class={`theme ${d.theme.done ? (d.theme.solved ? 'ok' : 'no') : ''}`} />
          <b class="mono">{d.score} pts</b>
        </div>

        <ol class="clues">
          {d.clues.map((c) => <ClueCard key={c.index} c={c} open={open === c.index} onOpen={() => setOpen(open === c.index ? null : c.index)} update={(x) => { update(x); const n = nextAfter(x, c.index); setOpen(!x.clues[c.index].done ? c.index : x.clues[n].done ? firstOpen(x) : n); }} onSkip={() => setOpen(nextAfter(d, c.index))} />)}
        </ol>

        <ThemeCard d={d} open={open === 'theme'} onOpen={() => setOpen('theme')} update={update} />

        {d.finished && <Finished d={d} app={app} />}
      </main>
    </div>
  );
}

/** The next unfinished clue after this one (wrapping round), for "Skip"; stays put if it's the only one left. */
const nextAfter = (d: ClueDay, from: number): number => {
  for (let k = 1; k < d.clues.length; k++) { const i = (from + k) % d.clues.length; if (!d.clues[i].done) return i; }
  return from;
};

const firstOpen = (d: ClueDay): number | 'theme' | null => {
  const i = d.clues.findIndex((c) => !c.done);
  return i >= 0 ? i : d.theme.done ? null : 'theme';
};

function ClueCard({ c, open, onOpen, update, onSkip }: { c: CluePublic; open: boolean; onOpen: () => void; update: (d: ClueDay) => void; onSkip: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => setSure(false), [open]);
  const giveUp = async () => {
    if (!sure) { setSure(true); return; }
    try { update(await api.clueGiveUp(c.index)); fx.wrong(); } catch (err) { toast(err instanceof ApiError ? err.message : 'Could not do that'); }
  };
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && !c.done) setTimeout(() => input.current?.focus({ preventScroll: true }), 60); }, [open]);
  const left = CLUE_TRIES - c.guesses.length;

  const guess = async (e: Event) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.clueGuess(c.index, text);
      const now = r.day.clues[c.index];
      if (r.result === 'correct') { fx.correct(); setNote(''); }
      else { fx.wrong(); setNote(now.done ? '' : r.result === 'close' ? 'So close! Check the spelling.' : 'Not it. Here\'s another letter.'); }
      setText('');
      update(r.day);
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Could not send that'); } finally { setBusy(false); }
  };
  const hint = async () => {
    try { update(await api.clueHint(c.index)); fx.tap(); input.current?.focus(); } catch (err) { toast(err instanceof ApiError ? err.message : 'No more hints'); }
  };

  return (
    <li class={`clue-card ${open ? 'open' : ''} ${c.done ? (c.solved ? 'ok' : 'no') : ''}`} style={{ '--c': colorOf(c.category) } as any}>
      <button class="cc-head" onClick={onOpen} aria-expanded={open}>
        <span class="cc-cat"><i />{c.label}</span>
        <span class="cc-diff" aria-label={`Difficulty ${c.difficulty} of 3`}>{[1, 2, 3].map((n) => <i key={n} class={n <= c.difficulty ? 'on' : ''} />)}</span>
        <span class="cc-status">{c.done ? (c.solved ? <><IconCheck size={16} /> +{c.points}</> : <><IconClose size={16} /> 0</>) : c.guesses.length ? `${left} left` : ''}</span>
      </button>
      <p class="cc-clue">{c.clue}</p>
      <Blanks mask={c.mask} tone={c.done ? (c.solved ? 'good' : 'bad') : undefined} />
      {open && !c.done && (
        <form class="cc-form" onSubmit={guess}>
          <input ref={input} id={`clue-${c.index}`} class="input" value={text} onInput={(e) => { setText((e.target as HTMLInputElement).value); setNote(''); }} placeholder={`Your answer (${left} ${left === 1 ? 'guess' : 'guesses'} left)`} autoComplete="off" autoCorrect="off" autoCapitalize="words" spellcheck={false} enterKeyHint="send" maxLength={40} />
          <button class="btn primary" disabled={!text.trim() || busy}>Guess</button>
        </form>
      )}
      {open && !c.done && (
        <div class="cc-tools">
          <span class={`small ${note.startsWith('So') ? 'warn' : 'muted'}`} aria-live="polite">{note || (c.guesses.length ? `Tried: ${c.guesses.join(', ')}` : '')}</span>
          {(c.mask.match(/_/g) ?? []).length > 1 && <button class="btn small quiet" type="button" onClick={hint}>Reveal a letter (−{HINT_COST})</button>}
        </div>
      )}
      {open && !c.done && (
        <div class="cc-tools cc-skip">
          <button class="btn small quiet" type="button" onClick={onSkip}>Skip for now</button>
          <button class={`btn small quiet ${sure ? 'warn' : ''}`} type="button" onClick={giveUp}>{sure ? 'Tap again to show the answer (0 pts)' : 'Give up'}</button>
        </div>
      )}
      {c.done && <p class="cc-fact small">{c.fact}{c.solvedPct !== undefined && <span class="muted"> · {c.solvedPct}% of players got it</span>}</p>}
    </li>
  );
}

function ThemeCard({ d, open, onOpen, update }: { d: ClueDay; open: boolean; onOpen: () => void; update: (d: ClueDay) => void }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const t = d.theme;
  const left = THEME_TRIES - t.guesses.length;
  const guess = async (e: Event) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const r = await api.clueTheme(text);
      if (r.result === 'correct') fx.win(); else { fx.wrong(); setNote(r.day.theme.done ? '' : 'Not quite. Think about what all six have in common.'); }
      setText('');
      update(r.day);
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Could not send that'); }
  };
  return (
    <section class={`theme-card ${t.unlocked ? '' : 'locked'} ${t.done ? (t.solved ? 'ok' : 'no') : ''}`} onClick={t.unlocked && !open ? onOpen : undefined}>
      <span class="kicker">Finale · the hidden theme</span>
      {!t.unlocked ? (
        <p class="muted">Finish all six clues to unlock it. Then name what links the answers, for up to {THEME_POINTS[0]} bonus points.</p>
      ) : t.done ? (
        <>
          <h2 class="h2">{t.answer}</h2>
          <p class="small">{t.solved ? `You found it: +${t.points}` : 'Not this time.'}{t.solvedPct !== undefined && <span class="muted"> · {t.solvedPct}% of players found it</span>}</p>
        </>
      ) : (
        <>
          <h2 class="h3">What links all six answers?</h2>
          <div class="theme-answers">{d.clues.map((c) => <span key={c.index} class="ta" style={{ '--c': colorOf(c.category) } as any}>{c.answer}</span>)}</div>
          {t.nudge && <p class="small"><b>Nudge:</b> {t.nudge}</p>}
          <form class="cc-form" onSubmit={guess}>
            <input id="theme-guess" class="input" value={text} onInput={(e) => { setText((e.target as HTMLInputElement).value); setNote(''); }} placeholder={`The theme (${left} ${left === 1 ? 'guess' : 'guesses'} left)`} autoComplete="off" maxLength={60} />
            <button class="btn primary" disabled={!text.trim()}>Guess</button>
          </form>
          <div class="cc-tools">
            <span class="small muted" aria-live="polite">{note || (t.guesses.length ? `Tried: ${t.guesses.join(', ')}` : 'A word or short phrase is enough.')}</span>
            {!t.nudge && <button class="btn small quiet" type="button" onClick={async () => { try { update(await api.clueNudge()); } catch { /* ignore */ } }}>Need a nudge? (−{NUDGE_COST})</button>}
          </div>
        </>
      )}
    </section>
  );
}

function Finished({ d, app }: { d: ClueDay; app: App }) {
  const text = clueShareText(d);
  return (
    <section class="panel clue-done">
      <div class="done-score"><b>{d.score}</b><span>points · {d.clues.filter((c) => c.solved).length}/6 clues{d.theme.solved ? ' + theme' : ''}</span></div>
      <div class="share-row">
        <button class="btn primary xl grow" onClick={async () => { const s = await shareOrCopy(text); if (s === 'copied') toast('Copied. Paste it anywhere.'); }}><IconShare size={20} /> Share</button>
        <a class="btn whatsapp xl" href={whatsappUrl(text)} target="_blank" rel="noopener" aria-label="Share on WhatsApp"><IconWhatsApp /></a>
        <button class="btn xl" onClick={async () => { (await copy(text)) && toast('Copied'); }} aria-label="Copy"><IconCopy size={20} /></button>
      </div>
      <pre class="share-preview">{text.replace(/\n\S+$/, '')}</pre>
      {app.today.status !== 'done' && <button class="btn block" onClick={() => app.go('play')}>Now try the 60-second round on {d.letter}</button>}
    </section>
  );
}
