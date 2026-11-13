import type { StoryContent } from '@escape/story';
import type { Area, Stage } from '@escape/world';

/** Enter regions that repeatedly throw the player back need a warning before entry. */
export function throwbackAreas(stage: Stage, content: StoryContent,
  flags: Readonly<Record<string, boolean>>): readonly Area[] {
  const enabled = (value: { readonly onlyIf?: string; readonly unless?: string }): boolean =>
    (value.onlyIf === undefined || flags[value.onlyIf] === true)
    && (value.unless === undefined || flags[value.unless] !== true);
  return stage.triggers.flatMap(trigger => {
    if (trigger.on !== 'enter' || trigger.once || !enabled(trigger)) return [];
    const throwsBack = content.reactions.some(reaction => !reaction.once && enabled(reaction)
      && reaction.when.type === 'trigger' && reaction.when.trigger === trigger.id
      && reaction.then.some(effect => effect.type === 'world'
        && effect.effects.some(worldEffect => worldEffect.type === 'move-player')));
    return throwsBack ? [trigger.area] : [];
  });
}
