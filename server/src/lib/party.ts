// Party Rooms: live rounds for a group of friends, held in memory (one server instance).
// Letter rounds: lobby → reveal (letter spins) → playing → STOP (short grace) → review & votes → scores → … → final.
// Ladder races: lobby → reveal → playing (everyone climbs the same ladder; first to the top wins most) → scores → … → final.
import type { WebSocket } from 'ws';
import {
  CORE, LETTERS, PARTY_POINTS, PARTY_ROUND_OPTIONS, PARTY_SECONDS_OPTIONS, STOP_GRACE_MS, bonusCandidates, hash32, lagosDate, type Category,
} from '../../../shared/game.js';
import type { ClientMsg, PartyGame, PartyJudgement, PartyPhase, PartyState, ServerMsg } from '../../../shared/types.js';
import { RACE_POINTS, RACE_SECONDS_OPTIONS } from '../../../shared/ladder.js';
import { checkPath, makePuzzle, type LadderPuzzle } from './ladder.js';
import { countFor, judge } from './words.js';
import { shareId } from './ids.js';

const REVEAL_MS = 2600;
const MAX_PLAYERS = 12;
const IDLE_ROOM_MS = 2 * 3600_000;

interface Member { id: string; name: string; sockets: Set<WebSocket>; total: number; draft: Partial<Record<Category, string>>; joinedAt: number }
interface Judged { raw: string; display: string; norm: string; status: 'valid' | 'pending' | 'invalid' | 'blank'; votes: Map<string, 1 | -1> }
interface Room {
  code: string;
  hostId: string;
  members: Map<string, Member>;
  phase: PartyPhase;
  settings: { rounds: number; seconds: number; startWithDaily: boolean; game: PartyGame };
  round: number;
  letter: string | null;
  categories: Category[];
  usedLetters: string[];
  endsAt: number | null;
  stoppedBy: string | null;
  judged: Map<Category, Map<string, Judged>> | null;
  roundPoints: Record<string, number> | null;
  timer: ReturnType<typeof setTimeout> | null;
  touched: number;
  /** Ladder races: this round's puzzle, everyone's route and when they reached the top. */
  ladder: { puzzle: LadderPuzzle; paths: Map<string, string[]>; finishedAt: Map<string, number> } | null;
}

export class Parties {
  private rooms = new Map<string, Room>();
  constructor(private dailyLetter: () => Promise<{ letter: string; bonus: Category }>) {
    setInterval(() => {
      const now = Date.now();
      for (const [code, r] of this.rooms) if (now - r.touched > IDLE_ROOM_MS) { if (r.timer) clearTimeout(r.timer); this.rooms.delete(code); }
    }, 10 * 60_000).unref();
  }

  create(): string {
    let code = shareId(5).toUpperCase();
    while (this.rooms.has(code)) code = shareId(5).toUpperCase();
    this.rooms.set(code, {
      code, hostId: '', members: new Map(), phase: 'lobby', settings: { rounds: 5, seconds: 90, startWithDaily: true, game: 'letters' },
      round: 0, letter: null, categories: [], usedLetters: [], endsAt: null, stoppedBy: null, judged: null, roundPoints: null, timer: null, touched: Date.now(), ladder: null,
    });
    return code;
  }

  exists(code: string) { return this.rooms.has(code.toUpperCase()); }

  /** Handles one socket; `playerId` comes from the player's token, so rejoining keeps your seat and score. */
  connect(ws: WebSocket, playerId: string) {
    let room: Room | null = null;
    const send = (m: ServerMsg) => { try { ws.send(JSON.stringify(m)); } catch { /* closed */ } };
    ws.on('message', (buf) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(String(buf)); } catch { return; }
      try {
        if (msg.t === 'ping') return send({ t: 'pong' });
        if (msg.t === 'join') {
          room = this.join(msg.code, playerId, msg.name, ws);
          return;
        }
        if (!room) return send({ t: 'error', message: 'Join a room first' });
        this.handle(room, playerId, msg);
      } catch (e: any) {
        send({ t: 'error', message: e?.message ?? 'Something went wrong' });
      }
    });
    ws.on('close', () => {
      if (!room) return;
      const m = room.members.get(playerId);
      m?.sockets.delete(ws);
      if (m && m.sockets.size === 0 && room.hostId === playerId) {
        // Hand the host role to someone still connected.
        const next = [...room.members.values()].find((x) => x.sockets.size > 0);
        if (next) room.hostId = next.id;
      }
      this.broadcast(room);
    });
  }

  private join(rawCode: string, playerId: string, rawName: string, ws: WebSocket): Room {
    const room = this.rooms.get(String(rawCode).toUpperCase());
    if (!room) throw new Error('That room has closed. Ask for a new link.');
    const name = String(rawName ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Player';
    let m = room.members.get(playerId);
    if (!m) {
      if (room.members.size >= MAX_PLAYERS) throw new Error('This room is full');
      m = { id: playerId, name, sockets: new Set(), total: 0, draft: {}, joinedAt: Date.now() };
      room.members.set(playerId, m);
    } else m.name = name;
    m.sockets.add(ws);
    if (!room.hostId || !room.members.get(room.hostId)?.sockets.size) room.hostId = playerId;
    room.touched = Date.now();
    this.broadcast(room);
    return room;
  }

  private handle(room: Room, pid: string, msg: ClientMsg) {
    room.touched = Date.now();
    const host = room.hostId === pid;
    const member = room.members.get(pid)!;
    switch (msg.t) {
      case 'settings':
        if (!host || room.phase !== 'lobby') return;
        if ((msg.game === 'letters' || msg.game === 'ladder') && msg.game !== room.settings.game) {
          room.settings.game = msg.game;
          room.settings.seconds = msg.game === 'ladder' ? 120 : 90;
        }
        if (msg.rounds && (PARTY_ROUND_OPTIONS as readonly number[]).includes(msg.rounds)) room.settings.rounds = msg.rounds;
        if (msg.seconds && ((room.settings.game === 'ladder' ? RACE_SECONDS_OPTIONS : PARTY_SECONDS_OPTIONS) as readonly number[]).includes(msg.seconds)) room.settings.seconds = msg.seconds;
        if (typeof msg.startWithDaily === 'boolean') room.settings.startWithDaily = msg.startWithDaily;
        break;
      case 'start':
        if (!host || room.phase !== 'lobby') return;
        for (const m of room.members.values()) m.total = 0;
        room.round = 0;
        room.usedLetters = [];
        void this.nextRound(room);
        return;
      case 'ladder': {
        const L = room.ladder;
        if (room.phase !== 'playing' || !L || L.finishedAt.has(pid)) return;
        const path = checkPath(L.puzzle, msg.path);
        L.paths.set(pid, path);
        if (path[path.length - 1] === L.puzzle.end) {
          L.finishedAt.set(pid, Date.now());
          // Everyone still here has finished: end the round.
          if ([...room.members.values()].filter((m) => m.sockets.size > 0).every((m) => L.finishedAt.has(m.id))) this.schedule(room, 1200, () => this.finishLadder(room));
        }
        break;
      }
      case 'draft':
        if (room.phase !== 'playing' && room.phase !== 'stopping') return;
        member.draft = sanitize(msg.answers, room.categories);
        break;
      case 'stop': {
        if (room.phase !== 'playing') return;
        member.draft = sanitize(msg.answers, room.categories);
        // STOP only counts when every box is filled.
        if (room.categories.some((c) => !(member.draft[c] ?? '').trim())) throw new Error('Fill every box to call STOP');
        this.stop(room, pid);
        break;
      }
      case 'vote': {
        if (room.phase !== 'review' || msg.playerId === pid) return;
        const j = room.judged?.get(msg.category)?.get(msg.playerId);
        if (!j || j.status !== 'pending') return;
        if (msg.value === 0) j.votes.delete(pid); else j.votes.set(pid, msg.value);
        break;
      }
      case 'score':
        if (!host || room.phase !== 'review') return;
        this.score(room);
        break;
      case 'next':
        if (!host || room.phase !== 'scores') return;
        if (room.round >= room.settings.rounds) room.phase = 'final';
        else { void this.nextRound(room); return; }
        break;
      case 'again':
        if (!host || room.phase !== 'final') return;
        room.phase = 'lobby'; room.round = 0; room.letter = null; room.judged = null; room.roundPoints = null; room.ladder = null;
        for (const m of room.members.values()) m.total = 0;
        break;
    }
    this.broadcast(room);
  }

  private async nextRound(room: Room) {
    if (room.settings.game === 'ladder') return this.nextLadder(room);
    room.round++;
    room.ladder = null;
    let letter: string;
    let bonus: Category;
    if (room.round === 1 && room.settings.startWithDaily) {
      ({ letter, bonus } = await this.dailyLetter());
    } else {
      const left = LETTERS.filter((l) => !room.usedLetters.includes(l));
      letter = left[hash32(`${room.code}:${room.round}:${Date.now()}`) % left.length];
      const n = hash32(`${room.code}:${room.round}:bonus`);
      bonus = bonusCandidates(n).find((b) => countFor(b, letter) >= 8) ?? 'country';
    }
    room.usedLetters.push(letter);
    room.letter = letter;
    room.categories = [...CORE, bonus];
    room.judged = null; room.roundPoints = null; room.stoppedBy = null;
    for (const m of room.members.values()) m.draft = {};
    room.phase = 'reveal';
    room.endsAt = Date.now() + REVEAL_MS;
    this.broadcast(room);
    this.schedule(room, REVEAL_MS, () => {
      room.phase = 'playing';
      room.endsAt = Date.now() + room.settings.seconds * 1000;
      this.broadcast(room);
      this.schedule(room, room.settings.seconds * 1000, () => this.stop(room, null));
    });
  }

  private nextLadder(room: Room) {
    room.round++;
    const seed = hash32(`${room.code}:${room.round}:${Date.now()}`);
    const kinds = ['classic', 'moves', 'locked'] as const;
    room.ladder = { puzzle: makePuzzle(seed, { kind: kinds[seed % 3], daily: false }), paths: new Map(), finishedAt: new Map() };
    room.letter = null; room.categories = []; room.judged = null; room.roundPoints = null; room.stoppedBy = null;
    room.phase = 'reveal';
    room.endsAt = Date.now() + REVEAL_MS;
    this.broadcast(room);
    this.schedule(room, REVEAL_MS, () => {
      room.phase = 'playing';
      room.endsAt = Date.now() + room.settings.seconds * 1000;
      this.broadcast(room);
      this.schedule(room, room.settings.seconds * 1000, () => this.finishLadder(room));
    });
  }

  /** Points by finishing place: 10, 7, 5, 4, 3, 2 (and 2 for anyone else who made it); 0 if you didn't reach the top. */
  private finishLadder(room: Room) {
    if (room.phase !== 'playing' || !room.ladder) return;
    const order = [...room.ladder.finishedAt.entries()].sort((a, b) => a[1] - b[1]).map(([pid]) => pid);
    const points: Record<string, number> = {};
    for (const m of room.members.values()) points[m.id] = 0;
    order.forEach((pid, i) => { points[pid] = RACE_POINTS[Math.min(i, RACE_POINTS.length - 1)]; });
    for (const [pid, p] of Object.entries(points)) { const m = room.members.get(pid); if (m) m.total += p; }
    room.roundPoints = points;
    room.phase = 'scores';
    room.endsAt = null;
    this.broadcast(room);
  }

  private stop(room: Room, by: string | null) {
    if (room.phase !== 'playing') return;
    room.phase = 'stopping';
    room.stoppedBy = by;
    room.endsAt = Date.now() + STOP_GRACE_MS;
    this.broadcast(room);
    this.schedule(room, STOP_GRACE_MS, () => {
      room.judged = new Map();
      for (const c of room.categories) {
        const per = new Map<string, Judged>();
        for (const m of room.members.values()) {
          const raw = m.draft[c] ?? '';
          const j = judge(c, room.letter!, raw);
          per.set(m.id, { raw, display: j.display || raw, norm: j.norm, status: j.status, votes: new Map() });
        }
        room.judged.set(c, per);
      }
      room.phase = 'review';
      room.endsAt = null;
      this.broadcast(room);
    });
  }

  private accepted(j: Judged) {
    if (j.status === 'valid') return true;
    if (j.status !== 'pending') return false;
    const up = [...j.votes.values()].filter((v) => v > 0).length;
    const down = j.votes.size - up;
    return up > down;
  }

  private score(room: Room) {
    const points: Record<string, number> = {};
    for (const m of room.members.values()) points[m.id] = 0;
    for (const [, per] of room.judged!) {
      const counts = new Map<string, number>();
      for (const j of per.values()) if (this.accepted(j)) counts.set(j.norm, (counts.get(j.norm) ?? 0) + 1);
      for (const [pid, j] of per) if (this.accepted(j)) points[pid] = (points[pid] ?? 0) + ((counts.get(j.norm) ?? 0) > 1 ? PARTY_POINTS.shared : PARTY_POINTS.unique);
    }
    for (const [pid, p] of Object.entries(points)) { const m = room.members.get(pid); if (m) m.total += p; }
    room.roundPoints = points;
    room.phase = 'scores';
  }

  private schedule(room: Room, ms: number, fn: () => void) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => { room.timer = null; fn(); }, ms);
  }

  private view(room: Room, viewer: string): PartyState {
    const showAnswers = room.phase === 'review' || room.phase === 'scores';
    const review: PartyState['review'] = showAnswers && room.judged ? {} : null;
    if (review && room.judged) {
      for (const [c, per] of room.judged) {
        const counts = new Map<string, number>();
        for (const j of per.values()) if (this.accepted(j)) counts.set(j.norm, (counts.get(j.norm) ?? 0) + 1);
        review[c] = [...per.entries()].map(([pid, j]): PartyJudgement => {
          const up = [...j.votes.values()].filter((v) => v > 0).length;
          const acc = this.accepted(j);
          return {
            playerId: pid, raw: j.raw, display: j.display, status: j.status, votesUp: up, votesDown: j.votes.size - up,
            myVote: (j.votes.get(viewer) ?? 0) as -1 | 0 | 1, accepted: acc,
            points: room.phase === 'scores' ? (acc ? ((counts.get(j.norm) ?? 0) > 1 ? PARTY_POINTS.shared : PARTY_POINTS.unique) : 0) : null,
          };
        });
      }
    }
    return {
      ladder: this.ladderView(room, viewer),
      code: room.code, phase: room.phase, settings: room.settings, round: room.round, letter: room.phase === 'lobby' ? null : room.letter,
      categories: room.categories, endsAt: room.endsAt, serverNow: Date.now(), stoppedBy: room.stoppedBy, review, roundPoints: room.roundPoints,
      players: [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((m) => ({
        id: m.id, name: m.name, connected: m.sockets.size > 0, host: m.id === room.hostId, total: m.total,
        filled: room.categories.filter((c) => (m.draft[c] ?? '').trim()).length, me: m.id === viewer,
      })),
    };
  }

  private ladderView(room: Room, viewer: string): PartyState['ladder'] {
    const L = room.ladder;
    if (!L || room.phase === 'lobby' || room.phase === 'final' && !room.roundPoints) return null;
    const over = room.phase === 'scores' || room.phase === 'final';
    const order = [...L.finishedAt.entries()].sort((a, b) => a[1] - b[1]).map(([pid]) => pid);
    const p = L.puzzle;
    return {
      start: p.start, end: p.end, par: p.par, twist: p.twist, myPath: L.paths.get(viewer) ?? [p.start], best: over ? p.best : null,
      progress: [...room.members.values()].map((m) => {
        const path = L.paths.get(m.id) ?? [p.start];
        const place = order.indexOf(m.id);
        return { playerId: m.id, steps: path.length - 1, done: place >= 0, place: place >= 0 ? place + 1 : null, path: over ? path : null };
      }),
    };
  }

  private broadcast(room: Room) {
    for (const m of room.members.values()) {
      const msg = JSON.stringify({ t: 'state', state: this.view(room, m.id) } satisfies ServerMsg);
      for (const s of m.sockets) { try { s.send(msg); } catch { /* closed */ } }
    }
  }

  /** For tests. */
  peek(code: string) { return this.rooms.get(code); }
}

function sanitize(a: unknown, cats: Category[]): Partial<Record<Category, string>> {
  const out: Partial<Record<Category, string>> = {};
  if (a && typeof a === 'object') for (const c of cats) { const v = (a as any)[c]; if (typeof v === 'string') out[c] = v.slice(0, 40); }
  return out;
}

export const todayKey = () => lagosDate();
