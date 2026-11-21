// The Ladder's dictionary, downloaded once (about 60 KB gzipped) so each rung is checked instantly on the phone.
let words: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;
export function loadLadderWords(): Promise<Set<string>> {
  if (words) return Promise.resolve(words);
  loading ??= fetch('/api/ladder/words').then((r) => { if (!r.ok) throw new Error('words'); return r.text(); })
    .then((t) => (words = new Set(t.split('\n'))))
    .catch((e) => { loading = null; throw e; });
  return loading;
}
