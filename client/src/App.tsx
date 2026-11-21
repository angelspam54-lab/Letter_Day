import { useCallback, useEffect, useState } from 'preact/hooks';
import type { LadderDay, ClueDay, DailyResult, DayInfo, GroupSummary, Player, SharePreview } from '../../shared/types';
import { api, ApiError } from './lib/api';
import { syncClock } from './lib/clock';
import { store } from './lib/storage';
import { Home } from './screens/Home';
import { Play } from './screens/Play';
import { Result } from './screens/Result';
import { Group } from './screens/Group';
import { Party } from './screens/Party';
import { Board } from './screens/Board';
import { Stats } from './screens/Stats';
import { Clue } from './screens/Clue';
import { Ladder } from './screens/Ladder';
import { Toast, toast } from './components/Toast';
import { LetterTile } from './components/Bits';
import { HowToPlay } from './components/Sheet';

export type Screen = 'home' | 'play' | 'result' | 'group' | 'party' | 'board' | 'stats' | 'clue' | 'ladder';

export interface App {
  screen: Screen;
  player: Player;
  today: DayInfo;
  groups: GroupSummary[];
  result: DailyResult | null;
  clue: ClueDay | null;
  setClue: (c: ClueDay) => void;
  ladder: LadderDay | null;
  setLadder: (l: LadderDay) => void;
  challenger: SharePreview | null;
  groupCode: string | null;
  partyCode: string | null;
  go: (s: Screen, opts?: { replace?: boolean }) => void;
  openGroup: (code: string) => void;
  openParty: (code: string) => void;
  setPlayer: (p: Player) => void;
  setToday: (d: DayInfo) => void;
  setResult: (r: DailyResult | null) => void;
  refreshGroups: () => Promise<void>;
  openHelp: () => void;
  reload: () => void;
}

export function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [today, setToday] = useState<DayInfo | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [result, setResult] = useState<DailyResult | null>(null);
  const [clue, setClue] = useState<ClueDay | null>(null);
  const [ladder, setLadder] = useState<LadderDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [groupCode, setGroupCode] = useState<string | null>(null);
  const [partyCode, setPartyCode] = useState<string | null>(null);
  const [challenger, setChallenger] = useState<SharePreview | null>(null);
  const [help, setHelp] = useState(false);

  const go = useCallback((s: Screen, opts: { replace?: boolean } = {}) => {
    setScreen(s);
    try {
      const fn = opts.replace || s === 'home' ? 'replaceState' : 'pushState';
      history[fn]({ screen: s }, '', s === 'home' ? location.pathname : `#${s}`);
    } catch { /* history unavailable */ }
    window.scrollTo(0, 0);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.bootstrap();
      syncClock(r.today.serverNow);
      setPlayer(r.player);
      setToday(r.today);
      setGroups(r.groups);
      api.clue().then(setClue).catch(() => setClue(null));
      api.ladder().then(setLadder).catch(() => setLadder(null));
      if (r.today.status === 'done') api.result().then(setResult).catch(() => {});
      else setResult(null);
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load Letter Day');
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const r = await load();
      if (!r) return;
      const q = new URLSearchParams(location.search);
      try { history.replaceState({ screen: 'home' }, '', location.pathname); } catch { /* ignore */ }
      if (q.get('play') === 'clue') go('clue');
      if (q.get('play') === 'ladder') go('ladder');
      const from = q.get('from');
      if (from) api.share(from).then(setChallenger).catch(() => {});
      const g = q.get('g');
      if (g) {
        try {
          const { group } = await api.joinGroup(g);
          const list = await api.groups();
          setGroups(list.groups);
          toast(`You're in "${group.name}"`);
          setGroupCode(group.code);
          go('group');
        } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not join that group'); }
      }
      const p = q.get('p');
      if (p === 'closed') toast('That party room has closed. Ask for a new link.');
      else if (p) {
        const { exists } = await api.partyExists(p).catch(() => ({ exists: false }));
        if (exists) { setPartyCode(p.toUpperCase()); go('party'); } else toast('That party room has closed. Ask for a new link.');
      }
      if (!q.get('play') && !from && !g && !p && r.player.gamesPlayed === 0 && !r.today.status && store.get('ld.seenHelp') !== '1') setHelp(true);
    })();
    const onPop = (e: PopStateEvent) => setScreen((e.state?.screen as Screen) ?? 'home');
    window.addEventListener('popstate', onPop);
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 120_000) load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('popstate', onPop); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (!player || !today) {
    return (
      <div class="boot">
        {error ? (
          <div class="boot-card">
            <LetterTile letter="!" size="lg" />
            <h1 class="h2">Can't reach Letter Day</h1>
            <p class="muted">{error}</p>
            <button class="btn primary" onClick={load}>Try again</button>
          </div>
        ) : <div class="boot-loader"><LetterTile letter="L" size="lg" /></div>}
      </div>
    );
  }

  const app: App = {
    screen, player, today, groups, result, clue, setClue, ladder, setLadder, challenger, groupCode, partyCode, go,
    openGroup: (code) => { setGroupCode(code); go('group'); },
    openParty: (code) => { setPartyCode(code.toUpperCase()); go('party'); },
    setPlayer, setToday, setResult,
    refreshGroups: async () => { try { setGroups((await api.groups()).groups); } catch { /* keep old */ } },
    openHelp: () => setHelp(true),
    reload: load,
  };

  return (
    <div class="app">
      {screen === 'home' && <Home app={app} />}
      {screen === 'play' && <Play app={app} />}
      {screen === 'result' && <Result app={app} />}
      {screen === 'group' && groupCode && <Group app={app} code={groupCode} />}
      {screen === 'party' && partyCode && <Party app={app} code={partyCode} />}
      {screen === 'board' && <Board app={app} />}
      {screen === 'stats' && <Stats app={app} />}
      {screen === 'clue' && <Clue app={app} />}
      {screen === 'ladder' && <Ladder app={app} />}
      {help && <HowToPlay onClose={() => { setHelp(false); store.set('ld.seenHelp', '1'); }} />}
      <Toast />
    </div>
  );
}
