import type { ComponentChildren } from 'preact';
import type { App } from '../App';
import { IconBack, IconHelp, IconStandings, IconStats } from './Icons';
import { LetterTile } from './Bits';

export function TopBar({ app, back, title, right }: { app: App; back?: () => void; title?: ComponentChildren; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      <div class="tb-left">
        {back ? <button class="icon-btn" onClick={back} aria-label="Back"><IconBack /></button>
          : <button class="brand" onClick={() => app.go('home')} aria-label="Letter Day home"><LetterTile letter={app.today.letter} size="sm" /><span>Letter Day</span></button>}
        {title && <h1 class="tb-title">{title}</h1>}
      </div>
      <div class="tb-right">
        {right ?? (
          <>
            <button class="icon-btn" onClick={app.openHelp} aria-label="How to play" title="How to play"><IconHelp /></button>
            <button class={`icon-btn ${app.screen === 'board' ? 'on' : ''}`} onClick={() => app.go('board')} aria-label="Today's ranks" title="Today's ranks"><IconStandings /></button>
            <button class={`icon-btn ${app.screen === 'stats' ? 'on' : ''}`} onClick={() => app.go('stats')} aria-label="Your stats" title="Your stats"><IconStats /></button>
          </>
        )}
      </div>
    </header>
  );
}
