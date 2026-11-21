import { twistLabel as twistLabelShort } from '../../../shared/ladder';
import { useState } from 'preact/hooks';
import type { App } from '../App';
import { TopBar } from '../components/TopBar';
import { Avatar, CatChip, LetterTile, TierStrip, formatDate } from '../components/Bits';
import { IconArrow, IconBolt, IconPlus, IconUsers } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { useCountdown } from '../lib/clock';
import { fx } from '../lib/fx';
import { LABEL } from '../../../shared/game';

export function Home({ app }: { app: App }) {
  const { today, result, groups, challenger, player } = app;
  const countdown = useCountdown(today.nextResetAt, app.reload);
  const [newGroup, setNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);

  const play = () => { fx.go(); app.go('play'); };
  const startParty = async () => {
    setBusy(true);
    try { const { code } = await api.createParty(); app.openParty(code); } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not start a room'); } finally { setBusy(false); }
  };
  const createGroup = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { group } = await api.createGroup(groupName);
      await app.refreshGroups();
      setNewGroup(false);
      setGroupName('');
      app.openGroup(group.code);
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Could not create the group'); } finally { setBusy(false); }
  };

  return (
    <div class="screen">
      <TopBar app={app} />
      <main class="page home">
        {challenger && today.status !== 'done' && challenger.isToday && (
          <div class="notice"><b>{challenger.nickname}</b>&nbsp;scored {challenger.score} on today's letter. Your turn.</div>
        )}

        <section class="today" aria-label="Today's letter">
          <p class="kicker">Letter Day #{today.number} · {formatDate(today.date, true)}</p>
          <div class="today-main">
            <LetterTile letter={today.letter} size="xl" />
            <div class="today-copy">
              <h1 class="h1">Today's letter is <span class="ink-letter">{today.letter}</span>.</h1>
              <p class="lede">Sixty seconds to find a name, an animal, a place, a thing and a food that start with {today.letter}, plus today's bonus: <b>{LABEL[today.bonus].toLowerCase()}</b>.</p>
              <div class="cat-row">{today.categories.map((c) => <CatChip key={c} category={c} small />)}</div>
            </div>
          </div>

          {today.status === 'done' && result ? (
            <div class="done-card">
              <div class="done-score"><b>{result.score}</b><span>points{result.rank && result.players > 1 ? ` · #${result.rank} of ${result.players}` : ''}</span></div>
              <TierStrip tiers={result.answers.map((a) => a.tier)} categories={result.answers.map((a) => a.category)} />
              <button class="btn primary" onClick={() => app.go('result')}>See your answers <IconArrow size={18} /></button>
            </div>
          ) : (
            <div class="cta-row">
              <button class="btn primary xl" onClick={play}>{today.status === 'started' ? 'Resume your 60 seconds' : 'Start · 60 seconds'} <IconArrow size={20} /></button>
              <span class="muted small">{today.status === 'started' ? 'Your clock is already running.' : 'The clock starts when you tap.'}</span>
            </div>
          )}
          <p class="next small muted">Next letter in <span class="mono">{countdown}</span></p>
        </section>

        <section class="friends" aria-label="More ways to play">
          {app.clue && (
            <button class="panel clue-promo" onClick={() => app.go('clue')}>
              <span class="cp-blanks" aria-hidden="true"><i>{today.letter}</i><i /><i /><i /><i /></span>
              <span class="grow">
                <b class="h3">The Clue</b>
                <span class="small muted">{app.clue.finished ? `${app.clue.score} points · ${app.clue.clues.filter((c) => c.solved).length}/6${app.clue.theme.solved ? ' + theme' : ''}` : app.clue.clues.some((c) => c.done) ? `${app.clue.clues.filter((c) => c.done).length} of 6 done · keep going` : `Six riddles on ${today.letter} and a hidden theme. No timer.`}</span>
              </span>
              <IconArrow size={18} />
            </button>
          )}
          {app.ladder && (
            <button class="panel clue-promo" onClick={() => app.go('ladder')}>
              <span class="cp-ladder" aria-hidden="true"><i>{(app.ladder.start.word ?? '?')[0].toUpperCase()}</i><i /><i /><i /></span>
              <span class="grow">
                <b class="h3">The Ladder</b>
                <span class="small muted">{app.ladder.finished ? `${app.ladder.score} points · ${app.ladder.steps} steps, par ${app.ladder.par}` : app.ladder.ready ? `${app.ladder.rungs.length - 1} steps so far · keep climbing` : `Change one word into another, a step at a time. Today: ${twistLabelShort(app.ladder.twist)}.`}</span>
              </span>
              <IconArrow size={18} />
            </button>
          )}
          <div class="panel party-card">
            <div class="pc-icon"><IconBolt size={24} /></div>
            <div class="grow">
              <h2 class="h3">Party Room</h2>
              <p class="small muted">Play live with friends. First to fill every box calls <b>STOP!</b></p>
            </div>
            <button class="btn" disabled={busy} onClick={startParty}>Start a room</button>
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2 class="h3"><IconUsers size={20} /> Your groups</h2>
              <button class="btn small" onClick={() => setNewGroup(true)}><IconPlus size={16} /> New group</button>
            </div>
            {groups.length === 0 ? (
              <p class="small muted">Make a group for your family, friends or office. Everyone plays the daily letter, then you compare answers side by side and vote on the doubtful ones.</p>
            ) : (
              <ul class="group-list">
                {groups.map((g) => (
                  <li key={g.code}>
                    <button class="group-row" onClick={() => app.openGroup(g.code)}>
                      <Avatar id={g.code} name={g.name} size={36} />
                      <span class="grow"><b>{g.name}</b><span class="small muted">{g.playedToday} of {g.members} played today{g.myRank ? ` · you're #${g.myRank}` : ''}</span></span>
                      <IconArrow size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {player.gamesPlayed > 0 && <p class="small muted center">Streak: <b>{player.currentStreak}</b> day{player.currentStreak === 1 ? '' : 's'} · Level {player.level}, {player.levelTitle}</p>}
        </section>
      </main>

      {newGroup && (
        <Sheet title="New group" onClose={() => setNewGroup(false)}>
          <form class="stack" onSubmit={createGroup}>
            <label class="field"><span>Group name</span><input id="group-name" class="input" maxLength={30} placeholder="e.g. Family, Office, Uni friends" value={groupName} onInput={(e) => setGroupName((e.target as HTMLInputElement).value)} /></label>
            <p class="small muted">You'll get a link to share in WhatsApp. Anyone who opens it joins the group.</p>
            <button class="btn primary block" disabled={busy || groupName.trim().length < 2}>Create group</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
