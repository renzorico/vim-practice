#!/usr/bin/env bash
# Dispatch one task to one agent runner in its own git worktree, in the background.
#
# Usage: tools/agents/dispatch.sh <task-id> <runner> <brief-file>
#   runner: claude-sonnet | claude-haiku | codex
#   role:   set ROLE=<engine-builder|game-builder|test-writer|content-reviewer> (default engine-builder)
#
# Every runner gets the same inputs (AGENTS.md is read by both Claude and Codex, role rules,
# task brief) and the same gate (typecheck + tests). That is what makes vendors swappable.
set -euo pipefail

TASK_ID="${1:?task id}"
RUNNER="${2:?runner}"
BRIEF="${3:?brief file}"
ROLE="${ROLE:-engine-builder}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_DIR="${REPO_ROOT}/../vim-practice-wt/${TASK_ID}"
BRANCH="task/${TASK_ID}"
LOG_DIR="${REPO_ROOT}/.agents/logs"
LOG_FILE="${LOG_DIR}/${TASK_ID}.log"
ROLE_FILE="${REPO_ROOT}/.claude/agents/${ROLE}.md"

[[ -f "$BRIEF" ]] || { echo "Brief not found: $BRIEF" >&2; exit 1; }
[[ -f "$ROLE_FILE" ]] || { echo "Role not found: $ROLE_FILE" >&2; exit 1; }
mkdir -p "$LOG_DIR"

if [[ ! -d "$WORKTREE_DIR" ]]; then
  git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE_DIR" main
  (cd "$WORKTREE_DIR" && npm install --silent)
fi

# Role rules without the YAML frontmatter, then the task brief.
ROLE_RULES="$(awk 'f>=2{print} /^---$/{f++}' "$ROLE_FILE")"
PROMPT="${ROLE_RULES}

## Your task (${TASK_ID})
$(cat "$BRIEF")"

ALLOWED_TOOLS="Read Glob Grep Edit Write Bash(npm install*) Bash(npm run *) Bash(npm test*) Bash(npx tsc*) Bash(npx vitest*) Bash(git add*) Bash(git commit*) Bash(git status*) Bash(git diff*) Bash(nvim --headless*)"

case "$RUNNER" in
  claude-sonnet|claude-haiku)
    MODEL="${RUNNER#claude-}"
    CMD=(claude -p "$PROMPT" --model "$MODEL" --permission-mode acceptEdits --allowedTools "$ALLOWED_TOOLS" --output-format text)
    ;;
  codex)
    # Uses your ChatGPT Plus login (`codex login`). Sandboxed to the worktree.
    CMD=(codex exec -s workspace-write --add-dir "$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)" -C "$WORKTREE_DIR" "$PROMPT")
    ;;
  *)
    echo "Unknown runner: $RUNNER" >&2; exit 1 ;;
esac

echo "[$(date -u +%FT%TZ)] ${TASK_ID} -> ${RUNNER} (${ROLE}) in ${WORKTREE_DIR}" | tee -a "$LOG_FILE"
(cd "$WORKTREE_DIR" && "${CMD[@]}" >>"$LOG_FILE" 2>&1; echo "[$(date -u +%FT%TZ)] exit $?" >>"$LOG_FILE") &
echo "Started. Follow with: tail -f ${LOG_FILE}"
