import { useEffect, useRef, useState } from 'preact/hooks';
import type { ClientMsg, PartyState, ServerMsg } from '../../../shared/types';
import { getToken } from './api';

/** Live connection to a party room. Reconnects automatically (your seat and score are kept server-side). */
export function useParty(code: string, name: string) {
  const [state, setState] = useState<PartyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const offset = useRef(0);
  const closed = useRef(false);

  useEffect(() => {
    closed.current = false;
    let retry = 0;
    let ping: ReturnType<typeof setInterval>;
    const open = () => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(getToken() ?? '')}`;
      const s = new WebSocket(url);
      ws.current = s;
      s.onopen = () => {
        retry = 0;
        setOnline(true);
        s.send(JSON.stringify({ t: 'join', code, token: '', name } satisfies ClientMsg));
        ping = setInterval(() => s.readyState === 1 && s.send(JSON.stringify({ t: 'ping' })), 20_000);
      };
      s.onmessage = (ev) => {
        const m = JSON.parse(ev.data) as ServerMsg;
        if (m.t === 'state') { offset.current = m.state.serverNow - Date.now(); setState(m.state); setError(null); }
        if (m.t === 'error') setError(m.message);
      };
      s.onclose = () => {
        clearInterval(ping);
        setOnline(false);
        if (!closed.current) setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
      };
    };
    open();
    return () => { closed.current = true; clearInterval(ping); ws.current?.close(); };
  }, [code, name]);

  const send = (m: ClientMsg) => { if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(m)); };
  /** Server-clock "now", so countdowns agree across phones. */
  const now = () => Date.now() + offset.current;
  return { state, error, online, send, now, clearError: () => setError(null) };
}
