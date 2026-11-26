import { useEffect, useRef, useState } from 'react';
import { DRILL_SKILLS, effectiveBox, type DrillSkill, type SkillId } from '@escape/curriculum';
import type { Progress } from '../play2/progress.js';
import { content } from '../play2/content.js';
import { BoxDots } from './DrillScreen.js';
import { focusedButton } from './focusedButton.js';
import type { DrillProgress } from './store.js';
import './drills.css';

const MAX_BOX = 5;

/**
 * Stages the player has cleared, from every record a save keeps: the story's list, a best score, and any
 * stage before the furthest one reached. Older saves filled only some of these.
 */
export function clearedForCopybook(saved: Progress | null, stageIds: readonly string[], known: readonly string[]): readonly string[] {
  const cleared = new Set([...known, ...(saved?.story.clearedStages ?? []), ...Object.keys(saved?.best ?? {})]);
  const reached = [saved?.stage, ...Object.keys(saved?.entries ?? {})].map(id => (id === undefined ? -1 : stageIds.indexOf(id)));
  const furthest = Math.max(-1, ...reached);
  stageIds.slice(0, Math.max(0, furthest)).forEach(id => cleared.add(id));
  return [...cleared];
}

/** Skills whose teaching stage the player has cleared, in the order the game teaches them. */
export function copybookSkills(clearedStages: readonly string[]): readonly DrillSkill[] {
  return DRILL_SKILLS.filter(skill => clearedStages.includes(skill.stage));
}

function boxOf(skill: DrillSkill, progress: DrillProgress, now: string): number {
  const mastery = progress.mastery[skill.id];
  return mastery === undefined ? 0 : effectiveBox(mastery, now);
}

/** The skill to practise next: the weakest, first taught on a tie. */
export function nextSkill(skills: readonly DrillSkill[], progress: DrillProgress, now: string): DrillSkill | undefined {
  return skills.reduce<DrillSkill | undefined>((best, skill) =>
    best === undefined || boxOf(skill, progress, now) < boxOf(best, progress, now) ? skill : best, undefined);
}

/** One word beside the dots: never written, slipping since last time, or kept for good. */
export function skillStatus(skill: DrillSkill, progress: DrillProgress, now: string): string {
  const mastery = progress.mastery[skill.id];
  if (mastery === undefined) return 'new';
  const box = effectiveBox(mastery, now);
  if (box < mastery.box) return 'fading';
  return box >= MAX_BOX ? 'kept' : '';
}

interface WorldGroup { readonly id: string; readonly name: string; readonly skills: readonly DrillSkill[] }

function groupByWorld(skills: readonly DrillSkill[]): readonly WorldGroup[] {
  return content.worlds.slice().sort((left, right) => left.order - right.order)
    .map(world => ({ id: world.id, name: world.name, skills: skills.filter(skill => world.stages.includes(skill.stage)) }))
    .filter(group => group.skills.length > 0);
}

interface CopybookProps {
  readonly skills: readonly DrillSkill[];
  readonly progress: DrillProgress;
  readonly now: string;
  readonly onPlay: (skill: SkillId) => void;
  readonly onBack: () => void;
}

export function Copybook({ skills, progress, now, onPlay, onBack }: CopybookProps) {
  const next = nextSkill(skills, progress, now);
  const [selected, setSelected] = useState(() => Math.max(0, next === undefined ? 0 : skills.indexOf(next)));
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape' || event.key === 'q') { event.preventDefault(); onBack(); }
      else if (event.key === 'j') { event.preventDefault(); setSelected(value => Math.min(skills.length - 1, value + 1)); }
      else if (event.key === 'k') { event.preventDefault(); setSelected(value => Math.max(0, value - 1)); }
      // A focused button answers Enter itself; the shortcut is only for the j/k choice.
      else if (event.key === 'Enter' && !event.repeat && !focusedButton(event)) {
        const skill = skills[selected];
        if (skill) { event.preventDefault(); onPlay(skill.id); }
      }
    };
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, [skills, selected, onPlay, onBack]);

  return <main className="copybook-desk" aria-label="Copybook">
    <article className="copybook-page">
      <header className="copybook-head">
        <h1>The Copybook</h1>
        <p>Ten lines per key. Write a line in as few keys as the margin asks, and the key stays with you.</p>
      </header>
      {skills.length === 0
        ? <p className="copybook-empty">The pages are blank. Clear The Margin, and the keys it teaches are written here.</p>
        : groupByWorld(skills).map(group => <section key={group.id} className="copybook-world" aria-labelledby={`copybook-${group.id}`}>
          <h2 id={`copybook-${group.id}`}>{group.name}</h2>
          <ol>{group.skills.map(skill => {
            const index = skills.indexOf(skill);
            const isNext = skill === next;
            return <li key={skill.id}>
              {isNext && <span className="copybook-next" aria-hidden="true">next</span>}
              <button ref={index === selected ? active : undefined} aria-current={index === selected ? 'true' : undefined} onClick={() => onPlay(skill.id)}>
                <span className="copybook-keys">{skill.keys.map(key => <kbd key={key}>{key}</kbd>)}</span>
                <span className="copybook-name">{skill.name}</span>
                <BoxDots box={boxOf(skill, progress, now)} />
                <span className="copybook-status">{skillStatus(skill, progress, now)}</span>
                {isNext && <span className="frame-accessible">Practise this next.</span>}
              </button>
            </li>;
          })}</ol>
        </section>)}
      <footer className="copybook-foot">
        <p><kbd>j</kbd> <kbd>k</kbd> choose · <kbd>Enter</kbd> practise · <kbd>Esc</kbd> back</p>
        <button onClick={onBack}>Back to title</button>
      </footer>
    </article>
  </main>;
}
