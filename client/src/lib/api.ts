import type {
  BoardEntry, BootstrapResponse, ClueDay, ClueGuessResponse, DailyResult, DayInfo, GroupDetail, GroupSummary, Player, SharePreview, Stats, SubmitResponse,
} from '../../../shared/types';
import type { Category } from '../../../shared/game';
import { store } from './storage';
import { ApiError } from './errors';
export { ApiError };

const TOKEN_KEY = 'ld.token';
export const getToken = () => store.get(TOKEN_KEY);
export const setToken = (t: string) => store.set(TOKEN_KEY, t);

async function req<T>(path: string, opts: { method?: string; body?: unknown; timeout?: number; retries?: number } = {}): Promise<T> {
  const { method = 'GET', body, timeout = 15_000, retries = method === 'GET' ? 2 : 0 } = opts;
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const token = getToken();
      const res = await fetch('/api' + path, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
        keepalive: path === '/daily/draft',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
      return data as T;
    } catch (e) {
      const network = !(e instanceof ApiError);
      if (network && attempt < retries) { await new Promise((r) => setTimeout(r, 600 * (attempt + 1))); continue; }
      if (network) throw new ApiError(0, navigator.onLine === false ? "You're offline" : 'Network is slow. Try again.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const api = {
  async bootstrap(): Promise<BootstrapResponse> {
    const r = await req<BootstrapResponse>('/bootstrap', { method: 'POST', body: {}, retries: 2 });
    setToken(r.token);
    return r;
  },
  start: () => req<{ today: DayInfo }>('/daily/start', { method: 'POST', retries: 2 }),
  draft: (answers: Partial<Record<Category, string>>) => req<{ ok: true }>('/daily/draft', { method: 'POST', body: { answers }, timeout: 6000 }),
  submit: (answers: Partial<Record<Category, string>>) => req<SubmitResponse>('/daily/submit', { method: 'POST', body: { answers }, retries: 2 }),
  result: () => req<DailyResult>('/daily/result'),
  board: () => req<{ date: string; entries: BoardEntry[]; me: BoardEntry | null; players: number }>('/daily/board'),
  stats: () => req<Stats>('/me'),
  setNickname: (nickname: string) => req<{ player: Player }>('/me', { method: 'PATCH', body: { nickname } }),
  groups: () => req<{ groups: GroupSummary[] }>('/groups'),
  createGroup: (name: string) => req<{ group: GroupSummary }>('/groups', { method: 'POST', body: { name } }),
  joinGroup: (code: string) => req<{ group: GroupSummary }>(`/groups/${encodeURIComponent(code)}/join`, { method: 'POST' }),
  leaveGroup: (code: string) => req<{ ok: true }>(`/groups/${encodeURIComponent(code)}/leave`, { method: 'POST' }),
  group: (code: string) => req<GroupDetail>(`/groups/${encodeURIComponent(code)}`),
  vote: (code: string, b: { playerId: string; category: Category; value: -1 | 0 | 1 }) => req<GroupDetail>(`/groups/${encodeURIComponent(code)}/vote`, { method: 'POST', body: b }),
  clue: () => req<ClueDay>('/clue'),
  clueGuess: (index: number, guess: string) => req<ClueGuessResponse>('/clue/guess', { method: 'POST', body: { index, guess } }),
  clueHint: (index: number) => req<ClueDay>('/clue/hint', { method: 'POST', body: { index } }),
  clueTheme: (guess: string) => req<ClueGuessResponse>('/clue/theme', { method: 'POST', body: { guess } }),
  clueNudge: () => req<ClueDay>('/clue/nudge', { method: 'POST' }),
  createParty: () => req<{ code: string }>('/party', { method: 'POST' }),
  partyExists: (code: string) => req<{ exists: boolean }>(`/party/${encodeURIComponent(code)}`),
  share: (id: string) => req<SharePreview>(`/share/${encodeURIComponent(id)}`),
};
