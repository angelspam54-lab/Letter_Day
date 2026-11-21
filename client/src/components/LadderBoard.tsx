import { useEffect, useRef, useState } from 'preact/hooks';
import { changedAt, stepError, twistHelp, twistLabel, type Twist } from '../../../shared/ladder';
import { loadLadderWords } from '../lib/ladderWords';
import { fx } from '../lib/fx';
import { IconLock } from './Icons';

/** One word as a row of tiles; `hot` letters changed from the rung before, `lock` is today's locked position. */
export function WordTiles({ word, hot = [], lock, tone }: { word: string; hot?: number[]; lock?: number; tone?: 'gold' | 'goal' | 'start' | 'done' }) {
  return (
    <span class={`wt ${tone ?? ''}`} aria-label={word}>
      {[...word.toUpperCase()].map((ch, i) => <i key={i} class={`${hot.includes(i) ? 'hot' : ''} ${lock === i ? 'lock' : ''}`}>{ch}</i>)}
    </span>
  );
}

export function TwistChip({ twist }: { twist: Twist }) {
  return <span class={`twist-chip t-${twist.kind}`} title={twistHelp(twist)}>{twist.kind === 'locked' && <IconLock size={13} />}{twistLabel(twist)}</span>;
}

/**
 * The climb: your rungs from the start word, a box for the next word, and the goal at the bottom.
 * Used by the daily ladder and by ladder races. `onChange` gets the whole new route; it can reject by throwing.
 */
export function LadderBoard({ start, end, twist, path, gold = [], par, done = false, onChange, extra }: {
  start: string; end: string; twist: Twist; path: string[]; gold?: boolean[]; par?: number; done?: boolean;
  onChange: (path: string[]) => Promise<void> | void; extra?: preact.ComponentChildren;
}) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dict, setDict] = useState<Set<string> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const route = path.length ? path : [start];
  const lock = twist.kind === 'locked' ? twist.index : undefined;
  const here = route[route.length - 1];

  useEffect(() => { loadLadderWords().then(setDict).catch(() => setErr("Couldn't load the word list. Check your connection.")); }, []);
  useEffect(() => { if (!done) input.current?.focus({ preventScroll: true }); }, [route.length, done]);

  const add = async (e: Event) => {
    e.preventDefault();
    const w = text.trim().toLowerCase();
    if (!w || busy) return;
    if (!dict) return setErr('Still loading the word list…');
    if (route.includes(w) && w !== end) return setErr(`${w.toUpperCase()} is already on your ladder`);
    const problem = stepError(here, w, twist, (x) => dict.has(x));
    if (problem) { fx.wrong(); return setErr(problem); }
    setBusy(true);
    try { await onChange([...route, w]); setText(''); setErr(''); fx.tap(); if (w === end) fx.win(); } catch (e: any) { setErr(e?.message ?? 'Could not add that'); } finally { setBusy(false); }
  };
  const undo = async () => {
    if (route.length < 2 || busy) return;
    setBusy(true);
    try { await onChange(route.slice(0, -1)); setErr(''); } catch (e: any) { setErr(e?.message ?? 'Could not undo'); } finally { setBusy(false); }
  };

  const steps = route.length - 1;
  return (
    <div class="ladder">
      <ol class="rungs">
        {route.map((w, i) => (
          <li key={i} class={`rung ${i === 0 ? 'first' : ''} ${gold[i] ? 'gold' : ''}`}>
            <span class="rung-n mono">{i === 0 ? 'Start' : i}</span>
            <WordTiles word={w} hot={i ? changedAt(route[i - 1], w) : []} lock={lock} tone={i === 0 ? 'start' : w === end ? 'done' : gold[i] ? 'gold' : undefined} />
            {gold[i] && <span class="gold-tag">Gold</span>}
          </li>
        ))}
      </ol>
      {!done && (
        <form class="ladder-form" onSubmit={add}>
          <input ref={input} id="ladder-next" class="input mono" value={text} maxLength={7} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellcheck={false} enterKeyHint="send"
            placeholder="Next word" onInput={(e) => { setText((e.target as HTMLInputElement).value.replace(/[^a-zA-Z]/g, '')); setErr(''); }} />
          <button class="btn primary" disabled={!text.trim() || busy}>Add</button>
        </form>
      )}
      {!done && (
        <div class="ladder-tools">
          <span class={`small ${err ? 'warn' : 'muted'}`} aria-live="polite">{err || twistHelp(twist)}</span>
          <span class="ladder-btns">
            {route.length > 1 && <button class="btn small quiet" type="button" onClick={undo} disabled={busy}>Undo</button>}
            {extra}
          </span>
        </div>
      )}
      <div class="rung goal">
        <span class="rung-n mono">Goal</span>
        <WordTiles word={end} lock={lock} tone="goal" />
        {par !== undefined && <span class="small muted">{steps} {steps === 1 ? 'step' : 'steps'} · par {par}</span>}
      </div>
    </div>
  );
}
