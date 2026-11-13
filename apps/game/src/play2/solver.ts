import type { WorldSim, WorldState } from '@escape/world';
import { createSession, type Session, type SessionDependencies } from './session.js';

/** Let the existing world solver traverse the actual story route. Dialogues take no turns.
 * Each world snapshot retains its own session, so branching never shares story progress.
 */
export function sessionSolver(dependencies: SessionDependencies): WorldSim {
  const controller = createSession(dependencies);
  const sessions = new WeakMap<WorldState, Session>();
  function remember(session: Session) {
    let next = session;
    for (let lines = 0; next.queue.length > 0; lines += 1) {
      if (lines >= 100) throw new Error('Dialogue sequence did not settle');
      next = controller.reduce(next, '<CR>');
    }
    sessions.set(next.world, next);
    return { state: next.world, events: next.lastEvents };
  }
  function lookup(state: WorldState): Session {
    const session = sessions.get(state);
    if (!session) throw new Error('Solver snapshot has no session');
    return session;
  }
  return {
    init: () => remember(controller.init()).state,
    step: (state, key) => remember(controller.reduce(lookup(state), key)),
    apply: (state, effects, stage, legend) => {
      const result = dependencies.sim.apply(state, effects, stage, legend);
      return remember({ ...lookup(state), world: result.state, lastEvents: result.events });
    },
    restore: state => {
      const result = dependencies.sim.restore(state);
      return remember({ ...lookup(state), world: result.state, lastEvents: result.events });
    },
  };
}
