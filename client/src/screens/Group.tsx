import { useEffect, useState } from 'preact/hooks';
import type { GroupDetail } from '../../../shared/types';
import type { App } from '../App';
import { LABEL } from '../../../shared/game';
import { CATEGORY_COLOR } from '../../../shared/palette';
import { TopBar } from '../components/TopBar';
import { Avatar, CatChip, LetterTile, TierPill } from '../components/Bits';
import { IconCopy, IconThumbDown, IconThumbUp, IconWhatsApp } from '../components/Icons';
import { toast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { copy, whatsappUrl } from '../lib/share';

export function Group({ app, code }: { app: App; code: string }) {
  const [g, setG] = useState<GroupDetail | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'answers' | 'all'>('answers');
  const load = () => api.group(code).then(setG).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load the group'));
  useEffect(() => { load(); const id = setInterval(load, 20_000); return () => clearInterval(id); }, [code]);

  const link = `${location.origin}/g/${code}`;
  const invite = `Join "${g?.name ?? 'my group'}" on Letter Day: same letter every day, compare answers. ${link}`;
  const vote = async (playerId: string, category: any, value: -1 | 0 | 1) => {
    try { setG(await api.vote(code, { playerId, category, value })); } catch (e) { toast(e instanceof ApiError ? e.message : 'Vote failed'); }
  };

  return (
    <div class="screen">
      <TopBar app={app} back={() => { app.refreshGroups(); app.go('home'); }} title={g?.name ?? 'Group'} />
      <main class="page group">
        {err && <p class="error-line">{err}</p>}
        {g && (
          <>
            <section class="invite">
              <span class="small muted">Invite with this link</span>
              <div class="row-actions">
                <code class="grow">{link.replace(/^https?:\/\//, '')}</code>
                <a class="btn whatsapp small" href={whatsappUrl(invite)} target="_blank" rel="noopener"><IconWhatsApp size={18} /> Invite</a>
                <button class="btn small" onClick={async () => { (await copy(link)) && toast('Link copied'); }} aria-label="Copy link"><IconCopy size={18} /></button>
              </div>
            </section>

            <div class="segmented" role="tablist">
              <button role="tab" aria-selected={view === 'answers'} class={view === 'answers' ? 'on' : ''} onClick={() => setView('answers')}>Today · {g.letter}</button>
              <button role="tab" aria-selected={view === 'all'} class={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>All time</button>
            </div>

            {view === 'answers' && (
              <>
                <ol class="ranking">
                  {g.members.map((m, i) => (
                    <li key={m.playerId} class={m.me ? 'me' : ''}>
                      <span class="rk">{m.played && m.score !== null ? i + 1 : '–'}</span>
                      <Avatar id={m.playerId} name={m.nickname} />
                      <span class="grow">{m.nickname}{m.me ? ' (you)' : ''}</span>
                      <b class="mono">{m.played ? (m.score ?? '✓') : <span class="muted small">not yet</span>}</b>
                    </li>
                  ))}
                </ol>

                {!g.iPlayed ? (
                  <div class="locked-answers">
                    <LetterTile letter={g.letter} size="lg" />
                    <p><b>Play today's letter to see everyone's answers.</b></p>
                    <p class="small muted">No peeking: answers stay hidden until you've played.</p>
                    <button class="btn primary" onClick={() => app.go(app.today.status === 'done' ? 'result' : 'play')}>Play {g.letter}</button>
                  </div>
                ) : (
                  <div class="compare">
                    {g.categories.map((c) => (
                      <section key={c} class="compare-cat" style={{ '--c': CATEGORY_COLOR[c] } as any}>
                        <h3><CatChip category={c} small /></h3>
                        <ul>
                          {g.members.filter((m) => m.answers).map((m) => {
                            const a = m.answers!.find((x) => x.category === c)!;
                            return (
                              <li key={m.playerId} class={`s-${a.status} ${a.groupAccepted ? 'accepted' : ''}`}>
                                <Avatar id={m.playerId} name={m.nickname} size={26} />
                                <span class="grow"><b>{a.display || <span class="muted">No answer</span>}</b>{a.status === 'invalid' && <span class="small warn"> {a.reason}</span>}</span>
                                {a.status === 'pending' ? (
                                  <span class="votes">
                                    {!m.me && <button class={`vote ${a.myVote === 1 ? 'on' : ''}`} onClick={() => vote(m.playerId, c, a.myVote === 1 ? 0 : 1)} aria-label={`Accept ${a.display} as ${LABEL[c]}`}><IconThumbUp size={16} />{a.votesUp || ''}</button>}
                                    {!m.me && <button class={`vote down ${a.myVote === -1 ? 'on' : ''}`} onClick={() => vote(m.playerId, c, a.myVote === -1 ? 0 : -1)} aria-label={`Reject ${a.display}`}><IconThumbDown size={16} />{a.votesDown || ''}</button>}
                                    {m.me && <span class="small muted">{a.groupAccepted ? 'Accepted by the group' : 'Waiting for votes'}</span>}
                                  </span>
                                ) : <TierPill tier={a.tier} category={c} pct={a.pct} />}
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                    <p class="small muted">Answers we don't recognise can be voted in by the group. Accepted answers score 10 in this group.</p>
                  </div>
                )}
              </>
            )}

            {view === 'all' && (
              <ol class="ranking">
                {g.allTime.map((m, i) => (
                  <li key={i} class={m.me ? 'me' : ''}><span class="rk">{i + 1}</span><span class="grow">{m.nickname}{m.me ? ' (you)' : ''}<span class="small muted"> · {m.days} day{m.days === 1 ? '' : 's'}</span></span><b class="mono">{m.total}</b></li>
                ))}
              </ol>
            )}
            <button class="btn quiet small leave" onClick={async () => { await api.leaveGroup(code).catch(() => {}); await app.refreshGroups(); toast(`Left "${g.name}"`); app.go('home'); }}>Leave this group</button>
          </>
        )}
      </main>
    </div>
  );
}
