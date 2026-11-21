import { useEffect, useRef, useState } from 'preact/hooks';
import type { LadderDay, LadderWordClue } from '../../../shared/types';
import { GOLD_MAX, GOLD_POINTS, LADDER_HINT_COST, WORD_CLUE_POINTS, parWord, twistHelp } from '../../../shared/ladder';
import type { App } from '../App';
import { TopBar } from '../components/TopBar';
import { LadderBoard, TwistChip, WordTiles } from '../components/LadderBoard';
import { Blanks } from './Clue';
import { IconCopy, IconShare, IconWhatsApp } from '../components/Icons';
import { toast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { fx } from '../lib/fx';
import { copy, ladderShareText, shareOrCopy, whatsappUrl } from '../lib/share';

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function Ladder({ app }: { app: App }) {
  const [d, setD] = useState<LadderDay | null>(app.ladder);
  const [err, setErr] = useState('');
  useEffect(() => { api.ladder().then((x) => { setD(x); app.setLadder(x); }).catch((e) => setErr(msg(e, "Could not load today's ladder"))); }, []);
  const update = (x: LadderDay) => { setD(x); app.setLadder(x); };

  if (!d) return <div class="screen"><TopBar app={app} back={() => app.go('home')} title="The Ladder" /><div class="center-msg"><p class="muted">{err || "Loading today's ladder…"}</p></div></div>;
  const path = d.rungs.map((r) => r.word);

  return (
    <div class="screen">
      <TopBar app={app} back={() => app.go('home')} title={`The Ladder #${d.number}`} />
      <main class="page clue-page">
        <header class="stack-sm">
          <h1 class="h2">Climb from one word to the other.</h1>
          <p class="small muted">Every rung must be a real word. {twistHelp(d.twist)} Par is {d.par} steps: beat it for extra points.</p>
          <div class="row wrap gap-sm"><TwistChip twist={d.twist} /><span class="gold-chip">★ Gold words: {d.theme.label}</span></div>
        </header>

        {!d.ready && (
          <section class="ladder-ends">
            <p class="small muted">First, work out today's two words from their clues ({WORD_CLUE_POINTS} points each, less for wrong guesses).</p>
            <EndClue label="Start word" which="start" w={d.start} update={update} />
            <EndClue label="End word" which="end" w={d.end} update={update} />
          </section>
        )}

        {d.ready && (
          <section class="panel">
            <LadderBoard start={d.start.word!} end={d.end.word!} twist={d.twist} path={path} gold={d.rungs.map((r) => r.gold)} par={d.par} done={d.finished}
              onChange={async (p) => { try { update(await api.ladderPath(p)); } catch (e) { throw new Error(msg(e, 'Could not save that')); } }}
              extra={<button class="btn small quiet" type="button" onClick={async () => { try { update(await api.ladderHint()); fx.tap(); } catch (e) { toast(msg(e, 'No hint right now')); } }}>Show me a step (−{LADDER_HINT_COST})</button>} />
          </section>
        )}

        {d.finished && <Finished d={d} app={app} />}
      </main>
    </div>
  );
}

function EndClue({ label, which, w, update }: { label: string; which: 'start' | 'end'; w: LadderWordClue; update: (d: LadderDay) => void }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const known = w.solved || w.revealed;
  const guess = async (e: Event) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const r = await api.ladderGuess(which, text);
      if (r.result === 'correct') fx.correct(); else { fx.wrong(); setNote(r.result === 'close' ? 'So close! Check the spelling.' : "Not it. Here's another letter."); }
      setText('');
      update(r.day);
    } catch (err) { toast(msg(err, 'Could not send that')); }
  };
  return (
    <div class={`clue-card ladder-clue ${known ? 'ok' : 'open'}`} style={{ '--c': which === 'start' ? 'var(--ink)' : '#3f9152' } as any}>
      <div class="lc-head"><b>{label}</b><span class="small muted">{w.length} letters</span></div>
      <p class="cc-clue">{w.clue}</p>
      {known ? <WordTiles word={w.word!} tone={which === 'start' ? 'start' : 'done'} /> : <Blanks mask={w.mask} />}
      {!known && (
        <>
          <form class="cc-form" onSubmit={guess}>
            <input ref={input} id={`ladder-${which}`} class="input" value={text} maxLength={20} autoComplete="off" autoCorrect="off" spellcheck={false} enterKeyHint="send"
              placeholder="Your answer" onInput={(e) => { setText((e.target as HTMLInputElement).value); setNote(''); }} />
            <button class="btn primary" disabled={!text.trim()}>Guess</button>
          </form>
          <div class="cc-tools">
            <span class={`small ${note.startsWith('So') ? 'warn' : 'muted'}`} aria-live="polite">{note || (w.guesses.length ? `Tried: ${w.guesses.join(', ')}` : '')}</span>
            <button class="btn small quiet" type="button" onClick={async () => { try { update(await api.ladderReveal(which)); } catch (err) { toast(msg(err, 'Could not reveal')); } }}>Show me the word (0 pts)</button>
          </div>
        </>
      )}
      {known && <p class="small muted">{w.solved ? 'Solved' : 'Revealed'}</p>}
    </div>
  );
}

function Finished({ d, app }: { d: LadderDay; app: App }) {
  const text = ladderShareText(d);
  const gold = d.rungs.filter((r) => r.gold).length;
  return (
    <section class="panel clue-done">
      <div class="done-score"><b>{d.score}</b><span>points · {d.steps} steps, par {d.par}: {parWord(d.steps!, d.par)}</span></div>
      <ul class="small stack-xs">
        <li>Clues: +{d.breakdown.clues}</li>
        <li>Climb: +{d.breakdown.climb}{d.hints ? ` (${d.hints} ${d.hints === 1 ? 'hint' : 'hints'} used)` : ''}</li>
        <li>Gold words: +{d.breakdown.gold}{gold ? ` (${gold} on your route, up to ${GOLD_MAX} count, ${GOLD_POINTS} each)` : ` (none on your route today)`}</li>
      </ul>
      {d.best && <div class="stack-xs"><span class="small muted">A shortest everyday route ({d.best.length - 1} steps):</span><div class="route">{d.best.map((w, i) => <span key={i}>{w}</span>)}</div></div>}
      {d.players > 1 && <p class="small muted">{d.finishedPct}% of today's players reached the top{d.avgSteps ? `, in ${d.avgSteps} steps on average` : ''}.</p>}
      <div class="share-row">
        <button class="btn primary xl grow" onClick={async () => { const s = await shareOrCopy(text); if (s === 'copied') toast('Copied. Paste it anywhere.'); }}><IconShare size={20} /> Share</button>
        <a class="btn whatsapp xl" href={whatsappUrl(text)} target="_blank" rel="noopener" aria-label="Share on WhatsApp"><IconWhatsApp /></a>
        <button class="btn xl" onClick={async () => { (await copy(text)) && toast('Copied'); }} aria-label="Copy"><IconCopy size={20} /></button>
      </div>
      <pre class="share-preview">{text.replace(/\n\S+$/, '')}</pre>
      <button class="btn block" onClick={() => app.go('home')}>Back to today's games</button>
    </section>
  );
}
