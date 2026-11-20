import { useRef } from 'preact/hooks';
import { LABEL, type Category } from '../../../shared/game';
import { CATEGORY_COLOR } from '../../../shared/palette';

/** One row per category: colour-coded label + a big input. Enter jumps to the next box. */
export function AnswerForm({ letter, categories, values, onChange, disabled, onLast, bonus }: {
  letter: string; categories: Category[]; values: Partial<Record<Category, string>>; onChange: (c: Category, v: string) => void;
  disabled?: boolean; onLast?: () => void; bonus?: Category;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <div class="answers" role="group" aria-label={`Answers starting with ${letter}`}>
      {categories.map((c, i) => {
        const v = values[c] ?? '';
        const ok = v.trim().toUpperCase().replace(/^(THE|A|AN) /, '').startsWith(letter);
        return (
          <label key={c} class={`answer-row ${v.trim() ? (ok ? 'filled' : 'wrong-letter') : ''}`} style={{ '--c': CATEGORY_COLOR[c] } as any}>
            <span class="ar-label"><i />{LABEL[c]}{c === bonus && <em>Bonus</em>}</span>
            <input
              ref={(el) => { refs.current[i] = el; }}
              id={`ans-${c}`}
              class="ar-input"
              value={v}
              placeholder={`${letter}…`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellcheck={false}
              enterKeyHint={i === categories.length - 1 ? 'done' : 'next'}
              maxLength={40}
              disabled={disabled}
              onInput={(e) => onChange(c, (e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (i < categories.length - 1) refs.current[i + 1]?.focus();
                else { (e.target as HTMLInputElement).blur(); onLast?.(); }
              }}
            />
            {v.trim() && !ok && <span class="ar-hint">Starts with {letter}</span>}
          </label>
        );
      })}
    </div>
  );
}
