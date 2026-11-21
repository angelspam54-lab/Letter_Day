import type { Twist } from './ladder.js';
// API + realtime contract between the Letter Day server and any client.
import type { Category, Status, Tier } from './game.js';
export type { Category, Status, Tier };

export interface Player {
  id: string; nickname: string | null; xp: number; level: number; levelTitle: string; levelInto: number; levelNeeded: number;
  currentStreak: number; bestStreak: number; gamesPlayed: number; lastPlayedDate: string | null;
}

export interface DayInfo {
  date: string;
  number: number;
  letter: string;
  categories: Category[]; // 5 core + today's bonus
  bonus: Category;
  serverNow: string;
  nextResetAt: string;
  /** null = not started; started = timer running; done = submitted. */
  status: null | 'started' | 'done';
  /** When started: server deadline for the timer. */
  deadline: string | null;
}

export interface AnswerResult {
  category: Category;
  raw: string;
  display: string;
  status: Status;
  tier: Tier;
  points: number;
  /** How many of today's players gave this same answer (you included), and the % of valid answers that is. */
  same: number;
  pct: number;
  reason?: string;
}

export interface Popular { category: Category; answers: { display: string; pct: number }[] }

export interface DailyResult {
  date: string;
  number: number;
  letter: string;
  answers: AnswerResult[];
  speedBonus: number;
  secondsLeft: number;
  score: number;
  rank: number | null;
  players: number;
  percentile: number | null;
  streak: number;
  xpEarned: number;
  shareId: string;
  popular: Popular[];
}

export interface BootstrapResponse { token: string; player: Player; today: DayInfo; groups: GroupSummary[] }

export interface StartResponse { today: DayInfo }
export interface SubmitResponse { result: DailyResult; player: Player }

export interface BoardEntry { rank: number; nickname: string; score: number; me: boolean }

export interface GroupSummary { code: string; name: string; members: number; playedToday: number; myRank: number | null }

export interface GroupMemberDay {
  playerId: string;
  nickname: string;
  me: boolean;
  played: boolean;
  /** Only filled once you have played today (no peeking). */
  answers: (AnswerResult & { votesUp: number; votesDown: number; myVote: -1 | 0 | 1; groupAccepted: boolean })[] | null;
  score: number | null;
}

export interface GroupDetail {
  code: string;
  name: string;
  date: string;
  letter: string;
  categories: Category[];
  iPlayed: boolean;
  members: GroupMemberDay[];
  /** All-time totals (sum of daily group scores). */
  allTime: { nickname: string; total: number; days: number; me: boolean }[];
}

export interface SharePreview { shareId: string; nickname: string; date: string; number: number; letter: string; score: number; tiers: Tier[]; categories: Category[]; isToday: boolean }

export interface Stats { player: Player; history: { date: string; number: number; letter: string; score: number; shareId: string }[]; tiers: Record<Tier, number>; rarest: { display: string; category: Category; letter: string; pct: number; date: string }[] }

// ---------- Party rooms (WebSocket) ----------
export type PartyPhase = 'lobby' | 'reveal' | 'playing' | 'stopping' | 'review' | 'scores' | 'final';

export interface PartyPlayer { id: string; name: string; connected: boolean; host: boolean; total: number; filled: number; me: boolean }

export interface PartyJudgement {
  playerId: string;
  raw: string;
  display: string;
  status: Status;
  votesUp: number;
  votesDown: number;
  myVote: -1 | 0 | 1;
  accepted: boolean;
  points: number | null;
}

export interface PartyState {
  code: string;
  phase: PartyPhase;
  players: PartyPlayer[];
  settings: { rounds: number; seconds: number; startWithDaily: boolean; game: PartyGame };
  round: number; // 1-based, 0 in lobby
  letter: string | null;
  categories: Category[];
  endsAt: number | null; // ms epoch (server clock)
  serverNow: number;
  stoppedBy: string | null;
  /** review/scores: category -> judgements (others' answers are only sent once the round is over). */
  review: Partial<Record<Category, PartyJudgement[]>> | null;
  roundPoints: Record<string, number> | null;
  /** Ladder races only. */
  ladder: PartyLadder | null;
}

/** What a party room plays: the classic letter round, or a ladder race. */
export type PartyGame = 'letters' | 'ladder';

export type ClientMsg =
  | { t: 'join'; code: string; token: string; name: string }
  | { t: 'settings'; rounds?: number; seconds?: number; startWithDaily?: boolean; game?: PartyGame }
  | { t: 'ladder'; path: string[] }
  | { t: 'start' }
  | { t: 'draft'; answers: Partial<Record<Category, string>> }
  | { t: 'stop'; answers: Partial<Record<Category, string>> }
  | { t: 'vote'; category: Category; playerId: string; value: -1 | 0 | 1 }
  | { t: 'score' }
  | { t: 'next' }
  | { t: 'again' }
  | { t: 'ping' };

export type ServerMsg = { t: 'state'; state: PartyState } | { t: 'error'; message: string } | { t: 'pong' };

// ---------- The Clue ----------
export interface CluePublic {
  index: number;
  category: string;
  label: string;
  difficulty: 1 | 2 | 3;
  clue: string;
  /** Letter blanks, e.g. "E____", with revealed letters filled in. */
  mask: string;
  guesses: string[];
  hints: number;
  solved: boolean;
  done: boolean;
  points: number;
  /** Only once done. */
  answer?: string;
  fact?: string;
  /** % of today's players who solved it (once done). */
  solvedPct?: number;
}

export interface ClueDay {
  date: string;
  number: number;
  letter: string;
  clues: CluePublic[];
  theme: { unlocked: boolean; guesses: string[]; nudge: string | null; solved: boolean; done: boolean; points: number; answer?: string; solvedPct?: number };
  score: number;
  finished: boolean;
  players: number;
}

export interface ClueGuessResponse { result: 'correct' | 'close' | 'wrong'; day: ClueDay }

// ---------- The Ladder ----------
export interface LadderWordClue {
  clue: string;
  length: number;
  /** e.g. "C___" – first letter, plus one more per wrong guess. */
  mask: string;
  guesses: string[];
  solved: boolean;
  revealed: boolean;
  /** Once solved or revealed. */
  word?: string;
}
export interface LadderRung { word: string; gold: boolean }
export interface LadderDay {
  date: string;
  number: number;
  twist: Twist;
  /** Words on this theme glow gold on your route. */
  theme: { key: string; label: string };
  par: number;
  start: LadderWordClue;
  end: LadderWordClue;
  /** Both ends known: the climb is open. */
  ready: boolean;
  /** Your route so far, start first (empty until ready). */
  rungs: LadderRung[];
  hints: number;
  finished: boolean;
  steps: number | null;
  score: number;
  breakdown: { clues: number; climb: number; gold: number };
  /** Once finished: a shortest everyday route. */
  best?: string[];
  players: number;
  finishedPct?: number;
  avgSteps?: number;
}
export interface LadderGuessResponse { result: 'correct' | 'close' | 'wrong'; day: LadderDay }
export interface PartyLadder {
  start: string;
  end: string;
  par: number;
  twist: Twist;
  /** Your own route this round. */
  myPath: string[];
  /** Shown once the round is over. */
  best: string[] | null;
  progress: { playerId: string; steps: number; done: boolean; place: number | null; path: string[] | null }[];
}
