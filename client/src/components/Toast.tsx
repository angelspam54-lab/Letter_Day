import { useEffect, useState } from 'preact/hooks';

let push: ((m: string) => void) | null = null;
export const toast = (m: string) => push?.(m);

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    push = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), 2400); };
    return () => { push = null; clearTimeout(t); };
  }, []);
  return msg ? <div class="toast" role="status">{msg}</div> : null;
}
