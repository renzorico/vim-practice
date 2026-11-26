import { useEffect, useState } from 'react';
import { DRILL_SKILLS, effectiveBox, type DrillSkill, type SkillId } from '@escape/curriculum';
import { BoxDots } from './DrillScreen.js';
import type { DrillProgress } from './store.js';
import './drills.css';

/** Skills whose teaching stage the player has cleared, weakest first (ties keep teaching order). */
export function copybookSkills(clearedStages: readonly string[], progress: DrillProgress, now: string): readonly DrillSkill[] {
  const boxOf = (skill: DrillSkill): number => {
    const mastery = progress.mastery[skill.id];
    return mastery === undefined ? 0 : effectiveBox(mastery, now);
  };
  return DRILL_SKILLS.filter(skill => clearedStages.includes(skill.stage))
    .map((skill, order) => ({ skill, order, box: boxOf(skill) }))
    .sort((left, right) => left.box - right.box || left.order - right.order)
    .map(entry => entry.skill);
}

interface CopybookProps {
  readonly skills: readonly DrillSkill[];
  readonly progress: DrillProgress;
  readonly now: string;
  readonly onPlay: (skill: SkillId) => void;
  readonly onBack: () => void;
}

export function Copybook({ skills, progress, now, onPlay, onBack }: CopybookProps) {
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape' || event.key === 'q') { event.preventDefault(); onBack(); }
      else if (event.key === 'j') { event.preventDefault(); setSelected(value => Math.min(skills.length - 1, value + 1)); }
      else if (event.key === 'k') { event.preventDefault(); setSelected(value => Math.max(0, value - 1)); }
      else if (event.key === 'Enter' && !event.repeat) {
        const skill = skills[selected];
        if (skill) { event.preventDefault(); onPlay(skill.id); }
      }
    };
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, [skills, selected, onPlay, onBack]);

  return <main className="script-panel copybook" aria-label="Copybook">
    <header className="script-heading">
      <h2>The Copybook</h2>
      <p className="script-goal">The Scribe's practice pages. Ten short reps per key, weakest keys first.</p>
    </header>
    {skills.length === 0 ? <p>Nothing to practise yet. Clear the Margin first.</p>
      : <ol className="copybook-list">{skills.map((skill, index) => {
        const mastery = progress.mastery[skill.id];
        return <li key={skill.id}>
          <button aria-current={index === selected ? 'true' : undefined} onClick={() => onPlay(skill.id)}>
            <span className="copybook-name">{skill.name}</span>
            <span className="drill-keys">{skill.keys.map(key => <kbd className="learned-key" key={key}>{key}</kbd>)}</span>
            <BoxDots box={mastery === undefined ? 0 : effectiveBox(mastery, now)} />
          </button>
        </li>;
      })}</ol>}
    <p className="play-menu-hint"><kbd>j</kbd> / <kbd>k</kbd> to choose · <kbd>Enter</kbd> to practise · <kbd>Esc</kbd> back</p>
    <button onClick={onBack}>Back</button>
  </main>;
}
