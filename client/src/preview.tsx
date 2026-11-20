/** Standalone preview of The Clue: every puzzle set, played entirely in the browser (no server). */
import { render } from 'preact';
import { useState } from 'preact/hooks';
import sets from '@clues';
import type { ClueDay } from '../../shared/types';
import { checkAnswer, checkTheme, cluePoints, CLUE_TRIES, letterCount, NUDGE_COST, revealMask, THEME_POINTS, THEME_TRIES, shownLetters, canHint, FREE_NUDGE_AFTER } from '../../shared/clue';
import { api, ApiError } from './lib/api';
import { store } from './lib/storage';
import type { App } from './App';
import { Clue } from './screens/Clue';
import { LetterTile } from './components/Bits';
import { Toast } from './components/Toast';
import './styles.css';

interface Set { id: string; letter: string; theme: string; themeAccept: string[]; themeHint: string; clues: { category: string; label: string; difficulty: 1 | 2 | 3; clue: string; answer: string; accept: string[]; fact: string }[] }
interface State { clues: { guesses: string[]; hints: number; solved: boolean; done: boolean; points: number }[]; theme: { guesses: string[]; nudge: boolean; solved: boolean; done: boolean; points: number } }
const ALL = (sets as Set[]).slice().sort((a, b) => a.letter.localeCompare(b.letter) || a.id.localeCompare(b.id));

const key = (s: Set) => `ldp.${s.id}`;
const load = (s: Set): State => {
  try { const v = store.get(key(s)); if (v) return JSON.parse(v); } catch { /* fresh */ }
  return { clues: s.clues.map(() => ({ guesses: [], hints: 0, solved: false, done: false, points: 0 })), theme: { guesses: [], nudge: false, solved: false, done: false, points: 0 } };
};
const save = (s: Set, st: State) => store.set(key(s), JSON.stringify(st));
const score = (st: State) => st.clues.reduce((n, c) => n + c.points, 0) + st.theme.points;

function view(s: Set, st: State): ClueDay {
  return {
    date: '', number: ALL.indexOf(s) + 1, letter: s.letter, players: 1,
    clues: s.clues.map((c, i) => {
      const x = st.clues[i];
      return {
        index: i, category: c.category, label: c.label, difficulty: c.difficulty, clue: c.clue,
        mask: revealMask(c.answer, x.done ? letterCount(c.answer) : shownLetters(c.answer, x.hints, x.guesses.length)),
        guesses: x.guesses, hints: x.hints, solved: x.solved, done: x.done, points: x.points,
        ...(x.done ? { answer: c.answer, fact: c.fact } : {}),
      };
    }),
    theme: {
      unlocked: st.clues.every((c) => c.done), guesses: st.theme.guesses, nudge: st.theme.nudge || st.theme.guesses.length >= FREE_NUDGE_AFTER ? s.themeHint : null,
      solved: st.theme.solved, done: st.theme.done, points: st.theme.points, ...(st.theme.done ? { answer: s.theme } : {}),
    },
    score: score(st), finished: st.theme.done,
  };
}

let current: Set = ALL[0];
const fail = (m: string): never => { throw new ApiError(400, m); };
Object.assign(api, {
  clue: async () => view(current, load(current)),
  clueGuess: async (i: number, raw: string) => {
    const st = load(current); const c = current.clues[i]; const x = st.clues[i];
    const text = raw.trim().slice(0, 40); if (!text) fail('Type a guess');
    const result = checkAnswer(text, c.answer, c.accept);
    x.guesses.push(text);
    if (result === 'correct') { x.solved = x.done = true; x.points = cluePoints(x.guesses.length, x.hints); } else if (x.guesses.length >= CLUE_TRIES) x.done = true;
    save(current, st); return { result, day: view(current, st) };
  },
  clueHint: async (i: number) => {
    const st = load(current); const x = st.clues[i];
    if (!canHint(current.clues[i].answer, x.hints, x.guesses.length)) fail("That's every hint for this one");
    x.hints++; save(current, st); return view(current, st);
  },
  clueTheme: async (raw: string) => {
    const st = load(current); const text = raw.trim().slice(0, 60); if (!text) fail('Type a guess');
    st.theme.guesses.push(text);
    const ok = checkTheme(text, current.themeAccept);
    if (ok) { st.theme.solved = st.theme.done = true; st.theme.points = Math.max(20, THEME_POINTS[st.theme.guesses.length - 1] - (st.theme.nudge ? NUDGE_COST : 0)); } else if (st.theme.guesses.length >= THEME_TRIES) st.theme.done = true;
    save(current, st); return { result: ok ? 'correct' : 'wrong', day: view(current, st) };
  },
  clueGiveUp: async (i: number) => { const st = load(current); const x = st.clues[i]; if (!x.done) { x.done = true; x.points = 0; save(current, st); } return view(current, st); },
  clueNudge: async () => { const st = load(current); st.theme.nudge = true; save(current, st); return view(current, st); },
});

function Preview() {
  const [open, setOpen] = useState<Set | null>(null);
  const [, bump] = useState(0);
  if (open) {
    current = open;
    const app = {
      screen: 'clue', today: { letter: open.letter, status: 'done' }, clue: null, setClue: () => {},
      go: () => { setOpen(null); window.scrollTo(0, 0); }, openHelp: () => {},
    } as unknown as App;
    return <div class="app preview"><Clue key={open.id} app={app} /><Toast /></div>;
  }
  return (
    <div class="app preview">
      <main class="page">
        <header class="pv-head">
          <LetterTile letter="?" size="lg" />
          <div>
            <span class="kicker">Letter Day · preview</span>
            <h1 class="h2">The Clue</h1>
            <p class="small muted">Six riddles, one letter, one hidden theme. In the real game everyone gets the same puzzle each day; here you can open any of them. Progress is saved on this device.</p>
          </div>
        </header>
        <div class="pv-grid">
          {ALL.map((s, i) => {
            const st = load(s); const started = st.clues.some((c) => c.guesses.length || c.hints);
            return (
              <button key={s.id} class={`pv-item ${st.theme.done ? 'done' : started ? 'started' : ''}`} onClick={() => { setOpen(s); window.scrollTo(0, 0); }}>
                <LetterTile letter={s.letter} size="sm" />
                <span>#{i + 1}</span>
                <b class="mono">{st.theme.done ? score(st) : started ? '…' : ''}</b>
              </button>
            );
          })}
        </div>
        {ALL.some((s) => store.get(key(s))) && <button class="btn quiet small" onClick={() => { ALL.forEach((s) => store.set(key(s), '')); bump((n) => n + 1); }}>Reset all progress</button>}
      </main>
    </div>
  );
}

render(<Preview />, document.getElementById('app')!);
