import { configDefaults, defineConfig } from 'vitest/config';

// Agent worktrees live under .claude/worktrees inside the repo; never run their copies of the tests.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
