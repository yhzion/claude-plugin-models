# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] — 2026-05-14

### Added
- `plugins/glm/scripts/lib/git.mjs` — git context helpers
  (`hasGitRepo`, `detectMainBranch`, `collectWorkingTreeDiff`,
  `collectBranchDiff`, `collectCommitLog`).
- `glm-companion review` subcommand and `/glm:review` slash command.
  Supports `--scope auto|working-tree|branch`, `--base <ref>`,
  `--background`, `--json`. Auto-detects scope from working-tree
  dirtiness; falls back to `<main>...HEAD` branch diff.
- `plugins/glm/prompts/review.md` — review prompt template with
  `{{DIFF}}`, `{{COMMITS}}`, `{{BASE_REF}}`, `{{SCOPE}}`, `{{REPO_NAME}}`,
  `{{BRANCH}}`, `{{BACKGROUND}}` placeholders. Enforces structured
  output (`## Intent`, `## Issues`, `## Looks good`) with severity
  enum (`critical`/`major`/`minor`).
- `plugins/glm/schemas/review-output.schema.json` — JSON Schema
  describing the structured form of a review for future consumers.
- Tests: `tests/lib/git.test.mjs`, `tests/companion-review.test.mjs`,
  `tests/review-schema.test.mjs`, `tests/smoke-review.test.mjs`
  (live, gated by `GLM_SMOKE=1`).

### Changed
- Plugin version bumped to `0.3.0` in `plugin.json` and `marketplace.json`.

## [0.2.0] — 2026-05-14

### Added
- `plugins/glm/scripts/glm-companion.mjs` — CLI orchestrator with subcommands
  `setup`, `task`, `status`, `result`, `cancel`.
- `plugins/glm/scripts/lib/state.mjs` — atomic job-record CRUD
  (`~/.claude/glm-jobs/default/<id>.json`).
- `plugins/glm/scripts/lib/claude-runner.mjs` — `claude -p` subprocess driver
  with foreground (sync) and background (detached + log file) modes.
- Slash commands: `/glm:setup`, `/glm:rescue`, `/glm:status`, `/glm:result`,
  `/glm:cancel`.
- `glm-rescue` agent — lifecycle-aware delegate for tracked / long-running
  tasks, complementary to the simpler `glm` one-shot agent.
- Tests: `tests/lib/state.test.mjs`, `tests/lib/claude-runner.test.mjs`,
  `tests/companion.test.mjs`, `tests/commands.test.mjs`,
  `tests/agents-rescue.test.mjs`, `tests/smoke-companion.test.mjs` (live, gated
  by `GLM_SMOKE=1`).
- Environment variables for the companion: `GLM_SETTINGS_PATH`,
  `GLM_JOBS_DIR`, `GLM_CLAUDE_BIN` (test injection).

### Changed
- `README.md`: documented all v0.2.0 slash commands, updated structure
  diagram, marked v0.2.0 complete in the roadmap.
- Plugin version bumped to `0.2.0` in `plugin.json` and `marketplace.json`.

## [0.1.0] — 2026-05-14

### Added
- Marketplace structure (`.claude-plugin/marketplace.json`) hosting a single
  `glm` plugin under `plugins/glm/`.
- `glm` agent (`plugins/glm/agents/glm.md`) with Korean trigger phrases
  ("glm 에이전트에게 ~~ 시켜줘"). Invokes z.ai GLM-5.1 via nested
  `claude --settings ~/.claude/settings.glm.json -p`.
- TDD smoke-test harness using `node --test`: manifest, marketplace, agent,
  repo, and live z.ai/GLM-5.1 round-trip (gated by `GLM_SMOKE=1`).
- `.github/pull_request_template.md` for future PR workflow.
