import { useEffect, useRef, useState } from 'preact/hooks';
import type { App } from '../App';
import type { Category } from '../../../shared/game';
import { DAILY_SECONDS, speedBonus } from '../../../shared/game';
import { api, ApiError } from '../lib/api';
import { now, syncClock } from '../lib/clock';
import { fx } from '../lib/fx';
import { store } from '../lib/storage';
import { AnswerForm } from '../components/AnswerForm';
import { LetterSpinner, LetterTile } from '../components/Bits';
import { IconClose } from '../components/Icons';
import { toast } from '../components/Toast';

const DRAFT_KEY = (date: string) => `ld.draft.${date}`;

export function Play({ app }: { app: App }) {
  const { today } = app;
  const [deadline, setDeadline] = useState<number | null>(today.deadline ? Date.parse(today.deadline) : null);
  const [values, setValues] = useState<Partial<Record<Category, string>>>(() => { try { return JSON.parse(store.get(DRAFT_KEY(today.date)) ?? '{}'); } catch { return {}; } });
  const [left, setLeft] = useState(DAILY_SECONDS * 1000);
  const [phase, setPhase] = useState<'reveal' | 'play' | 'sending' | 'error'>(today.deadline ? 'play' : 'reveal');
  const [err, setErr] = useState('');
  const sent = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout>>();
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    if (today.status === 'done') { app.go('result', { replace: true }); return; }
    if (today.deadline) return;
    // The 60 seconds start on the server when the reveal finishes.
    const t = setTimeout(async () => {
      try {
        const r = await api.start();
        syncClock(r.today.serverNow);
        app.setToday(r.today);
        setDeadline(Date.parse(r.today.deadline!));
        setPhase('play');
        fx.go();
        setTimeout(() => (document.getElementById(`ans-${today.categories[0]}`) as HTMLInputElement | null)?.focus(), 60);
      } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not start'); setPhase('error'); }
    }, 2300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!deadline) return;
    let lastTick = 99;
    const id = setInterval(() => {
      const l = Math.max(0, deadline - now());
      setLeft(l);
      const s = Math.ceil(l / 1000);
      if (s <= 5 && s < lastTick && l > 0) { lastTick = s; fx.tick(); }
      if (l <= 0) { clearInterval(id); submit(true); }
    }, 200);
    return () => clearInterval(id);
  }, [deadline]);

  const change = (c: Category, v: string) => {
    const next = { ...valuesRef.current, [c]: v };
    setValues(next);
    store.set(DRAFT_KEY(today.date), JSON.stringify(next));
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => api.draft(next).catch(() => {}), 700);
  };

  const submit = async (timeUp = false) => {
    if (sent.current) return;
    sent.current = true;
    setPhase('sending');
    if (timeUp) fx.wrong(); else fx.correct();
    try {
      const r = await api.submit(valuesRef.current);
      store.del(DRAFT_KEY(today.date));
      app.setResult(r.result);
      app.setPlayer(r.player);
      app.setToday({ ...today, status: 'done', deadline: null });
      fx.win();
      app.go('result', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { app.reload(); app.go('home', { replace: true }); return; }
      sent.current = false;
      setErr(e instanceof ApiError ? e.message : 'Could not send your answers');
      setPhase('error');
      toast('Your answers are saved. Tap "Send answers" to try again.');
    }
  };

  const secs = Math.ceil(left / 1000);
  const filled = today.categories.filter((c) => (values[c] ?? '').trim()).length;
  const urgent = phase === 'play' && secs <= 10;

  if (phase === 'reveal') {
    return (
      <div class="screen reveal-screen">
        <p class="kicker">Letter Day #{today.number}</p>
        <LetterSpinner letter={today.letter} />
        <p class="lede center">Get ready. Sixty seconds, six answers.</p>
      </div>
    );
  }

  return (
    <div class="screen play">
      <header class="play-bar">
        <button class="icon-btn" onClick={() => { if (phase === 'play') toast('Your clock keeps running while you are away.'); app.go('home', { replace: true }); }} aria-label="Leave"><IconClose /></button>
        <div class="pb-mid"><LetterTile letter={today.letter} size="sm" /><span class="pb-count">{filled}/6 filled</span></div>
        <span class={`pb-time ${urgent ? 'urgent' : ''}`} aria-live="off" aria-label={`${secs} seconds left`}>{secs}</span>
        <div class="timebar"><i style={{ width: `${(left / (DAILY_SECONDS * 1000)) * 100}%` }} class={urgent ? 'urgent' : ''} /></div>
      </header>
      <main class="page play-page">
        <AnswerForm letter={today.letter} categories={today.categories} bonus={today.bonus} values={values} onChange={change} disabled={phase === 'sending'} onLast={() => filled === 6 && submit()} />
        {phase === 'error' && <p class="error-line">{err}</p>}
        <div class="play-actions">
          <button class="btn primary xl block" disabled={phase === 'sending'} onClick={() => submit()}>
            {phase === 'sending' ? 'Sending…' : phase === 'error' ? 'Send answers' : filled === 6 ? `Done · +${speedBonus(secs)} speed bonus` : `Done early (${filled}/6)`}
          </button>
        </div>
      </main>
    </div>
  );
}
