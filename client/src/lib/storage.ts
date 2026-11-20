/** localStorage that never throws (private mode, blocked storage, in-app browsers). */
const mem = new Map<string, string>();
export const store = {
  get(k: string): string | null {
    try { return localStorage.getItem(k); } catch { return mem.get(k) ?? null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(k, v); } catch { mem.set(k, v); }
  },
  del(k: string) {
    try { localStorage.removeItem(k); } catch { mem.delete(k); }
  },
};
