import { useEffect, useState } from 'preact/hooks';
import type { Stats as StatsT } from '../../../shared/types';
import { LABEL, TIER_LABEL, type Tier } from '../../../shared/game';
import type { App } from '../App';
import { TopBar } from '../components/TopBar';
import { CatChip, LetterTile, Stat, formatDate } from '../components/Bits';
import { toast } from '../components/Toast';
import { api, getToken, setToken } from '../lib/api';
import { isMuted, setMuted } from '../lib/fx';
import { copy } from '../lib/share';

export function Stats({ app }: { app: App }) {
  const { player } = app;
  const [s, setS] = useState<StatsT | null>(null);
  const [name, setName] = useState(player.nickname ?? '');
  const [muted, setM] = useState(isMuted());
  const [restore, setRestore] = useState('');
  const [showCode, setShowCode] = useState(false);
  useEffect(() => { api.stats().then((x) => { setS(x); app.setPlayer(x.player); }).catch(() => {}); }, []);
  const tiers: Tier[] = ['only', 'rare', 'uncommon', 'common', 'pending', 'miss'];
  const max = s ? Math.max(1, ...tiers.map((t) => s.tiers[t])) : 1;
  const avg = s && s.history.length ? Math.round(s.history.reduce((n, h) => n + h.score, 0) / s.history.length) : 0;

  return (
    <div class="screen">
      <TopBar app={app} back={() => app.go('home')} title="Your stats" />
      <main class="page stats-page">
        <section class="stat-tiles">
          <Stat value={player.gamesPlayed} label="Days played" />
          <Stat value={player.currentStreak} label="Current streak" />
          <Stat value={player.bestStreak} label="Best streak" />
          <Stat value={avg} label="Average score" />
        </section>
        <p class="muted small">Level {player.level} · {player.levelTitle} · {player.levelInto}/{player.levelNeeded} XP to the next level</p>

        <div class="stats-grid">
          <section class="panel">
            <h2 class="h3">How rare your answers are</h2>
            <div class="dist">
              {tiers.map((t) => (
                <div key={t} class={`dist-row t-${t}`}><span>{TIER_LABEL[t]}</span><span class="dist-bar"><i style={{ width: `${Math.max(s?.tiers[t] ? 6 : 0, ((s?.tiers[t] ?? 0) / max) * 100)}%` }} /><em>{s?.tiers[t] ?? 0}</em></span></div>
              ))}
            </div>
          </section>
          <section class="panel">
            <h2 class="h3">Your rarest answers</h2>
            {s && s.rarest.length ? (
              <ul class="rarest">{s.rarest.map((r, i) => <li key={i}><CatChip category={r.category} small /><b class="grow">{r.display}</b><span class="small muted">{r.pct}% of players</span></li>)}</ul>
            ) : <p class="small muted">Play a few days and your most original answers show up here.</p>}
          </section>
        </div>

        {s && s.history.length > 0 && (
          <section class="panel">
            <h2 class="h3">Recent days</h2>
            <ul class="history">{s.history.slice(0, 14).map((h) => <li key={h.date}><LetterTile letter={h.letter} size="sm" /><span class="grow">#{h.number}<span class="small muted"> · {formatDate(h.date)}</span></span><b class="mono">{h.score}</b><a class="small link" href={`/r/${h.shareId}`} target="_blank" rel="noopener">Card</a></li>)}</ul>
          </section>
        )}

        <section class="panel settings">
          <h2 class="h3">Settings</h2>
          <form class="field" onSubmit={async (e) => { e.preventDefault(); try { const r = await api.setNickname(name); app.setPlayer(r.player); toast('Saved'); } catch (err: any) { toast(err.message); } }}>
            <span>Your name</span>
            <div class="row-actions"><input id="nm" class="input grow" maxLength={20} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /><button class="btn primary" disabled={name.trim().length < 2}>Save</button></div>
          </form>
          <label class="setting-row"><span>Sound effects</span><input type="checkbox" class="switch" checked={!muted} onChange={(e) => { const m = !(e.target as HTMLInputElement).checked; setMuted(m); setM(m); }} /></label>
          <details>
            <summary>Move your progress to another device</summary>
            <p class="small muted">Your progress lives in this browser. Keep this code private and enter it on another device to continue there.</p>
            {showCode ? <button class="btn small mono-btn" onClick={async () => { (await copy(getToken() ?? '')) && toast('Code copied'); }}>{getToken()}</button> : <button class="btn small" onClick={() => setShowCode(true)}>Show my code</button>}
            <form class="row-actions" onSubmit={async (e) => { e.preventDefault(); const old = getToken(); setToken(restore.trim()); try { await api.stats(); location.href = '/'; } catch { if (old) setToken(old); toast('Code not recognised'); } }}>
              <input class="input grow" placeholder="Paste a code" value={restore} onInput={(e) => setRestore((e.target as HTMLInputElement).value)} /><button class="btn">Restore</button>
            </form>
          </details>
        </section>
      </main>
    </div>
  );
}
