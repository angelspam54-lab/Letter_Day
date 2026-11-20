import { useEffect, useRef, useState } from 'preact/hooks';
import type { App } from '../App';
import type { Category } from '../../../shared/game';
import { LABEL, PARTY_ROUND_OPTIONS, PARTY_SECONDS_OPTIONS } from '../../../shared/game';
import { CATEGORY_COLOR } from '../../../shared/palette';
import type { PartyState } from '../../../shared/types';
import { useParty } from '../lib/party';
import { api } from '../lib/api';
import { fx } from '../lib/fx';
import { copy, whatsappUrl } from '../lib/share';
import { AnswerForm } from '../components/AnswerForm';
import { Avatar, CatChip, LetterSpinner, LetterTile } from '../components/Bits';
import { IconClose, IconCopy, IconCrown, IconThumbDown, IconThumbUp, IconWhatsApp } from '../components/Icons';
import { toast } from '../components/Toast';

export function Party({ app, code }: { app: App; code: string }) {
  const [name, setName] = useState(app.player.nickname ?? '');
  const [joined, setJoined] = useState(!!app.player.nickname);
  if (!joined) {
    return (
      <div class="screen party">
        <header class="party-head"><button class="icon-btn" onClick={() => app.go('home')} aria-label="Leave"><IconClose /></button><span class="ph-code">Room {code}</span><span /></header>
        <main class="page narrow center-col">
          <LetterTile letter="!" size="lg" />
          <h1 class="h2 center">Join the party</h1>
          <form class="stack" onSubmit={async (e) => {
            e.preventDefault();
            try { const { player } = await api.setNickname(name); app.setPlayer(player); setJoined(true); } catch (err: any) { toast(err.message); }
          }}>
            <label class="field"><span>Your name</span><input id="party-name" class="input" maxLength={16} placeholder="So friends know who you are" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
            <button class="btn primary block xl" disabled={name.trim().length < 2}>Join room {code}</button>
          </form>
        </main>
      </div>
    );
  }
  return <Room app={app} code={code} name={app.player.nickname ?? name} />;
}

function Room({ app, code, name }: { app: App; code: string; name: string }) {
  const { state: s, error, online, send, now, clearError } = useParty(code, name);
  const [values, setValues] = useState<Partial<Record<Category, string>>>({});
  const [left, setLeft] = useState(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout>>();
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const lastRound = useRef(0);

  useEffect(() => { if (error) { toast(error); clearError(); } }, [error]);
  // New round: clear the boxes.
  useEffect(() => { if (s && s.round !== lastRound.current) { lastRound.current = s.round; setValues({}); } }, [s?.round]);
  // Pens down: send the last keystrokes right away.
  useEffect(() => { if (s?.phase === 'stopping') { send({ t: 'draft', answers: valuesRef.current }); fx.wrong(); } if (s?.phase === 'playing') { fx.go(); setTimeout(() => (document.getElementById(`ans-${s.categories[0]}`) as HTMLInputElement | null)?.focus(), 80); } }, [s?.phase]);
  useEffect(() => {
    if (!s?.endsAt) return;
    let last = 99;
    const id = setInterval(() => {
      const l = Math.max(0, s.endsAt! - now());
      setLeft(l);
      const sec = Math.ceil(l / 1000);
      if (s.phase === 'playing' && sec <= 5 && sec < last && l > 0) { last = sec; fx.tick(); }
    }, 150);
    return () => clearInterval(id);
  }, [s?.endsAt, s?.phase]);

  if (!s) return <div class="screen party"><div class="center-msg"><LetterTile letter="…" size="lg" /><p class="muted">Joining room {code}…</p></div></div>;

  const me = s.players.find((p) => p.me);
  const host = !!me?.host;
  const change = (c: Category, v: string) => {
    const next = { ...valuesRef.current, [c]: v };
    setValues(next);
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => send({ t: 'draft', answers: next }), 300);
  };
  const allFilled = s.categories.length > 0 && s.categories.every((c) => (values[c] ?? '').trim());
  const stop = () => { if (allFilled) { fx.correct(); send({ t: 'stop', answers: values }); } };
  const leave = () => app.go('home');
  const link = `${location.origin}/p/${code}`;
  const invite = `Join my Letter Day party! Name, Animal, Place, Thing, Food. First to finish calls STOP. ${link}`;
  const nameOf = (id: string | null) => s.players.find((p) => p.id === id)?.name ?? 'Someone';

  return (
    <div class="screen party">
      <header class="party-head">
        <button class="icon-btn" onClick={leave} aria-label="Leave room"><IconClose /></button>
        <span class="ph-code">{s.phase === 'lobby' ? `Room ${code}` : `Round ${s.round} of ${s.settings.rounds}`}{!online && <em class="offline"> · reconnecting…</em>}</span>
        <span class="ph-me">{me && <Avatar id={me.id} name={me.name} size={28} />}</span>
      </header>

      {s.phase === 'lobby' && (
        <main class="page narrow lobby">
          <section class="room-code">
            <span class="kicker">Room code</span>
            <div class="code-tiles">{code.split('').map((ch, i) => <LetterTile key={i} letter={ch} size="md" />)}</div>
            <div class="row-actions center-row">
              <a class="btn whatsapp" href={whatsappUrl(invite)} target="_blank" rel="noopener"><IconWhatsApp size={18} /> Invite on WhatsApp</a>
              <button class="btn" onClick={async () => { (await copy(link)) && toast('Link copied'); }}><IconCopy size={18} /> Copy link</button>
            </div>
          </section>
          <section class="panel">
            <h2 class="h3">Players · {s.players.length}</h2>
            <ul class="players">
              {s.players.map((p) => (
                <li key={p.id} class={p.connected ? '' : 'away'}><Avatar id={p.id} name={p.name} /><span class="grow">{p.name}{p.me ? ' (you)' : ''}</span>{p.host && <span class="host"><IconCrown size={16} /> Host</span>}{!p.connected && <span class="small muted">away</span>}</li>
              ))}
            </ul>
            {s.players.length < 2 && <p class="small muted">Waiting for friends to join…</p>}
          </section>
          <section class="panel">
            <h2 class="h3">Game settings</h2>
            <div class="setting-row"><span>Rounds</span><div class="segmented small">{PARTY_ROUND_OPTIONS.map((n) => <button key={n} class={s.settings.rounds === n ? 'on' : ''} disabled={!host} onClick={() => send({ t: 'settings', rounds: n })}>{n}</button>)}</div></div>
            <div class="setting-row"><span>Time limit</span><div class="segmented small">{PARTY_SECONDS_OPTIONS.map((n) => <button key={n} class={s.settings.seconds === n ? 'on' : ''} disabled={!host} onClick={() => send({ t: 'settings', seconds: n })}>{n}s</button>)}</div></div>
            <label class="setting-row"><span>Start with today's letter ({app.today.letter})</span><input type="checkbox" class="switch" checked={s.settings.startWithDaily} disabled={!host} onChange={(e) => send({ t: 'settings', startWithDaily: (e.target as HTMLInputElement).checked })} /></label>
            {host ? <button class="btn primary xl block" onClick={() => send({ t: 'start' })}>Start the game</button> : <p class="small muted center">The host will start the game.</p>}
          </section>
        </main>
      )}

      {s.phase === 'reveal' && s.letter && (
        <main class="reveal-screen"><span class="kicker">Round {s.round}</span><LetterSpinner letter={s.letter} duration={2100} /><div class="cat-row center-row">{s.categories.map((c) => <CatChip key={c} category={c} small />)}</div></main>
      )}

      {(s.phase === 'playing' || s.phase === 'stopping') && s.letter && (
        <>
          <div class="party-bar">
            <LetterTile letter={s.letter} size="sm" />
            <ul class="progress-chips">{s.players.map((p) => <li key={p.id} title={p.name}><Avatar id={p.id} name={p.name} size={26} /><i style={{ width: `${(p.filled / s.categories.length) * 100}%` }} /></li>)}</ul>
            <span class={`pb-time ${Math.ceil(left / 1000) <= 10 ? 'urgent' : ''}`}>{s.phase === 'stopping' ? '✋' : Math.ceil(left / 1000)}</span>
          </div>
          <main class="page play-page">
            <AnswerForm letter={s.letter} categories={s.categories} bonus={s.categories[5]} values={values} onChange={change} disabled={s.phase === 'stopping'} onLast={stop} />
            <button class={`btn stop xl block ${allFilled ? 'ready' : ''}`} disabled={!allFilled || s.phase !== 'playing'} onClick={stop}>{allFilled ? 'STOP!' : `Fill all ${s.categories.length} to call STOP`}</button>
          </main>
          {s.phase === 'stopping' && (
            <div class="stop-overlay" role="alert">
              <span class="so-word">STOP!</span>
              <span class="so-who">{s.stoppedBy ? `${nameOf(s.stoppedBy)} called it` : "Time's up"}</span>
              <span class="small">Pens down…</span>
            </div>
          )}
        </>
      )}

      {(s.phase === 'review' || s.phase === 'scores') && s.review && (
        <main class="page review">
          <header class="review-head">
            <LetterTile letter={s.letter!} size="md" />
            <div><h1 class="h2">{s.phase === 'review' ? 'Check the answers' : `Round ${s.round} scores`}</h1><p class="small muted">{s.phase === 'review' ? 'Vote on answers we don\'t recognise. Unique answers score 10, shared 5.' : s.stoppedBy ? `${nameOf(s.stoppedBy)} called STOP` : 'Time ran out'}</p></div>
          </header>
          {s.phase === 'scores' && <Scoreboard s={s} />}
          {s.categories.map((c) => (
            <section key={c} class="compare-cat" style={{ '--c': CATEGORY_COLOR[c] } as any}>
              <h3><CatChip category={c} small /></h3>
              <ul>
                {s.review![c]!.map((j) => {
                  const p = s.players.find((x) => x.id === j.playerId);
                  return (
                    <li key={j.playerId} class={`s-${j.status} ${j.accepted ? 'accepted' : ''}`}>
                      <Avatar id={j.playerId} name={p?.name ?? '?'} size={26} />
                      <span class="grow"><b>{j.display || <span class="muted">No answer</span>}</b>{j.status === 'invalid' && <span class="small warn"> wrong letter</span>}</span>
                      {s.phase === 'review' && j.status === 'pending' && j.playerId !== me?.id ? (
                        <span class="votes">
                          <button class={`vote ${j.myVote === 1 ? 'on' : ''}`} onClick={() => send({ t: 'vote', category: c, playerId: j.playerId, value: j.myVote === 1 ? 0 : 1 })} aria-label={`Accept ${j.display} as ${LABEL[c]}`}><IconThumbUp size={16} />{j.votesUp || ''}</button>
                          <button class={`vote down ${j.myVote === -1 ? 'on' : ''}`} onClick={() => send({ t: 'vote', category: c, playerId: j.playerId, value: j.myVote === -1 ? 0 : -1 })} aria-label={`Reject ${j.display}`}><IconThumbDown size={16} />{j.votesDown || ''}</button>
                        </span>
                      ) : (
                        <span class={`verdict ${j.accepted ? 'yes' : 'no'}`}>{j.points !== null ? `+${j.points}` : j.accepted ? '✓' : j.status === 'pending' ? 'vote' : '✕'}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div class="sticky-actions">
            {host ? (
              s.phase === 'review'
                ? <button class="btn primary xl block" onClick={() => send({ t: 'score' })}>Score this round</button>
                : <button class="btn primary xl block" onClick={() => send({ t: 'next' })}>{s.round >= s.settings.rounds ? 'See final results' : `Next round (${s.round + 1} of ${s.settings.rounds})`}</button>
            ) : <p class="small muted center">Waiting for the host…</p>}
          </div>
        </main>
      )}

      {s.phase === 'final' && <Final s={s} host={host} send={send} leave={leave} />}
    </div>
  );
}

function Scoreboard({ s }: { s: PartyState }) {
  const rows = [...s.players].sort((a, b) => b.total - a.total);
  return (
    <ol class="ranking">
      {rows.map((p, i) => (
        <li key={p.id} class={p.me ? 'me' : ''}><span class="rk">{i + 1}</span><Avatar id={p.id} name={p.name} /><span class="grow">{p.name}</span><span class="small muted">+{s.roundPoints?.[p.id] ?? 0}</span><b class="mono">{p.total}</b></li>
      ))}
    </ol>
  );
}

function Final({ s, host, send, leave }: { s: PartyState; host: boolean; send: (m: any) => void; leave: () => void }) {
  const rows = [...s.players].sort((a, b) => b.total - a.total);
  useEffect(() => { fx.win(); }, []);
  return (
    <main class="page narrow final">
      <h1 class="h1 center">{rows[0]?.name} wins!</h1>
      <div class="podium">
        {[1, 0, 2].map((i) => rows[i] && (
          <div key={i} class={`pod p${i + 1}`}>
            <Avatar id={rows[i].id} name={rows[i].name} size={i === 0 ? 56 : 44} />
            <b>{rows[i].name}</b><span class="mono">{rows[i].total}</span>
            <span class="pod-step">{i + 1}</span>
          </div>
        ))}
      </div>
      {rows.length > 3 && <Scoreboard s={s} />}
      <div class="row-actions center-row">
        {host ? <button class="btn primary xl" onClick={() => send({ t: 'again' })}>Play again</button> : <p class="small muted">The host can start another game.</p>}
        <button class="btn xl" onClick={leave}>Leave room</button>
      </div>
    </main>
  );
}
