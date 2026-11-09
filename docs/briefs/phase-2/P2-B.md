# P2-B: skill graph, mastery, review picker, unlocks
Owns: `packages/curriculum/src/skills/**`

Implement every export listed under "Progress, mastery, unlocks" in `contracts.ts`, in `skills/index.ts`.
- Leitner boxes 0-5, review intervals in days [0, 1, 2, 4, 7, 15] (index = box). `effectiveBox` loses one box per full missed interval after the due date, never below 1 for a learned skill.
- `recordResult` keeps the best stars and the fewest keystrokes per level and never lowers them. `lastPracticed` = `finishedAt`.
- `isUnlocked` is purely skill-based (cumulative learning): no hard-coded level order.
- `pickReviewLevels` prefers completed levels whose `teaches` cover the most review-queue skills, ties broken by level id (deterministic).
- `createMemoryStorage` returns deep-independent copies (mutating a loaded object must not change storage).
All functions pure and deterministic. Tests: at least 40, including decay across months, unlock chains from the real catalog (Prologue then Region 1), and best-result retention.
