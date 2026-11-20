import { useEffect, useState } from 'preact/hooks';
import type { App } from '../App';
import { TopBar } from '../components/TopBar';
import { CatChip, LetterTile, TierPill, TierStrip } from '../components/Bits';
import { IconArrow, IconCopy, IconShare, IconUsers, IconWhatsApp } from '../components/Icons';
import { toast } from '../components/Toast';
import { api } from '../lib/api';
import { useCountdown } from '../lib/clock';
import { copy, shareOrCopy, shareText, whatsappUrl } from '../lib/share';

export function Result({ app }: { app: App }) {
  const { today, player, groups } = app;
  const [r, setR] = useState(app.result);
  const [shown, setShown] = useState(0);
  const [name, setName] = useState('');
  const countdown = useCountdown(today.nextResetAt);

  // Rarity changes as more people play, so refresh on open.
  useEffect(() => { api.result().then((x) => { setR(x); app.setResult(x); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!r) return;
    const start = performance.now();
    let raf = 0;
    const step = () => { const t = Math.min(1, (performance.now() - start) / 700); setShown(Math.round(r.score * (1 - (1 - t) ** 3))); if (t < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [r?.score]);

  if (!r) return <div class="screen"><TopBar app={app} back={() => app.go('home')} /><div class="center-msg"><p class="muted">Loading your answers…</p></div></div>;

  const text = shareText(r);
  const saveName = async (e: Event) => {
    e.preventDefault();
    try { const { player: p } = await api.setNickname(name); app.setPlayer(p); toast('Name saved'); } catch (err: any) { toast(err.message); }
  };

  return (
    <div class="screen">
      <TopBar app={app} back={() => app.go('home')} title={`Letter Day #${r.number}`} />
      <main class="page result">
        <section class="r-head">
          <LetterTile letter={r.letter} size="lg" />
          <div class="r-score">
            <b>{shown}</b>
            <span>points{r.speedBonus ? ` (incl. +${r.speedBonus} speed)` : ''}</span>
            <span class="muted small">{r.players > 1 ? `#${r.rank} of ${r.players} players so far${r.percentile ? ` · better than ${r.percentile}%` : ''}` : "You're the first to play today"}</span>
          </div>
        </section>
        <TierStrip tiers={r.answers.map((a) => a.tier)} categories={r.answers.map((a) => a.category)} />

        <ol class="r-answers">
          {r.answers.map((a, i) => {
            const pop = r.popular.find((p) => p.category === a.category)?.answers.filter((x) => x.display !== a.display).slice(0, 2) ?? [];
            return (
              <li key={a.category} class={`r-row s-${a.status}`}>
                <CatChip category={a.category} small />
                <div class="r-ans">
                  <b>{a.display || <span class="muted">No answer</span>}</b>
                  {a.status === 'invalid' && <span class="small warn">{a.reason}</span>}
                  {a.status === 'pending' && <span class="small muted">Not in our lists yet. It counts if 3 players give it, or your group votes it in.</span>}
                  {pop.length > 0 && <span class="small muted">Others said: {pop.map((p) => `${p.display} (${p.pct}%)`).join(', ')}</span>}
                </div>
                <div class="r-pts"><TierPill tier={a.tier} category={a.category} pct={a.pct} /><span class="mono">{a.points ? `+${a.points}` : '0'}</span></div>
              </li>
            );
          })}
        </ol>
        <p class="small muted">Rarity is measured against everyone who plays today, so scores keep moving until midnight.</p>

        <section class="share">
          <div class="share-row">
            <button class="btn primary xl grow" onClick={async () => { const s = await shareOrCopy(text, `/og/${r.shareId}.png`); if (s === 'copied') toast('Copied. Paste it anywhere.'); }}><IconShare size={20} /> Share</button>
            <a class="btn whatsapp xl" href={whatsappUrl(text)} target="_blank" rel="noopener" aria-label="Share on WhatsApp"><IconWhatsApp /></a>
            <button class="btn xl" onClick={async () => { (await copy(text)) && toast('Copied'); }} aria-label="Copy result"><IconCopy size={20} /></button>
          </div>
          <pre class="share-preview">{text.replace(/\n\S+$/, '')}</pre>
        </section>

        {!player.nickname && (
          <form class="panel stack" onSubmit={saveName}>
            <label class="field"><span>Your name for ranks and groups</span>
              <div class="row-actions"><input id="nick" class="input grow" maxLength={20} placeholder="e.g. Ada" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /><button class="btn primary" disabled={name.trim().length < 2}>Save</button></div>
            </label>
          </form>
        )}

        <section class="panel">
          <h2 class="h3"><IconUsers size={20} /> Compare with friends</h2>
          {groups.length ? groups.map((g) => (
            <button key={g.code} class="group-row" onClick={() => app.openGroup(g.code)}><span class="grow"><b>{g.name}</b><span class="small muted">{g.playedToday} of {g.members} played</span></span><IconArrow size={18} /></button>
          )) : <p class="small muted">Create a group from the home screen and share its link. You'll see each other's answers here.</p>}
        </section>
        <p class="center muted small">Next letter in <span class="mono">{countdown}</span></p>
      </main>
    </div>
  );
}
