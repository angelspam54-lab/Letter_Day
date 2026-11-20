import { useEffect, useState } from 'preact/hooks';
import type { BoardEntry } from '../../../shared/types';
import type { App } from '../App';
import { TopBar } from '../components/TopBar';
import { LetterTile } from '../components/Bits';
import { api } from '../lib/api';

export function Board({ app }: { app: App }) {
  const [data, setData] = useState<{ entries: BoardEntry[]; me: BoardEntry | null; players: number } | null>(null);
  useEffect(() => { api.board().then(setData).catch(() => setData({ entries: [], me: null, players: 0 })); }, []);
  const meIn = data?.entries.some((e) => e.me);
  return (
    <div class="screen">
      <TopBar app={app} back={() => app.go('home')} title="Today's ranks" />
      <main class="page narrow">
        <div class="board-head"><LetterTile letter={app.today.letter} size="md" /><p class="muted">{data ? `${data.players} player${data.players === 1 ? '' : 's'} so far today. Scores move as more people play.` : 'Loading…'}</p></div>
        {data && (
          <ol class="ranking big">
            {data.entries.length === 0 && <li class="empty">Nobody has played yet. Be the first.</li>}
            {data.entries.map((e, i) => <li key={i} class={e.me ? 'me' : ''}><span class="rk">{e.rank}</span><span class="grow">{e.nickname}{e.me ? ' (you)' : ''}</span><b class="mono">{e.score}</b></li>)}
            {data.me && !meIn && <><li class="gap" aria-hidden="true">⋯</li><li class="me"><span class="rk">{data.me.rank}</span><span class="grow">{data.me.nickname} (you)</span><b class="mono">{data.me.score}</b></li></>}
          </ol>
        )}
        {app.today.status !== 'done' && <button class="btn primary block" onClick={() => app.go('play')}>Play today's letter</button>}
      </main>
    </div>
  );
}
