# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] — 2026-05-14

### Changed
- `README.md` restructured to follow the convergent Claude Code marketplace
  README pattern, validated against 15+ cached plugin READMEs (codex,
  sentry, hookify, slack, vercel, pinecone, telegram, etc.). New section
  ordering matches user decision flow: header → overview → features →
  requirements → installation → quick start → usage → skills →
  troubleshooting → structure → tests → roadmap → license.

### Added
- **Requirements** section (Claude Code, Node.js 18+, z.ai plan, git).
- **Quick Start** section — three-step minimal verification path
  (`/glm:setup` → smallest GLM round-trip → meaningful first use).
- **Per-command Usage sections** — each of the 6 slash commands gets a
  dedicated subsection with synopsis, flags, and runnable examples
  (matching codex's `/codex:review` / `/codex:adversarial-review` /
  `/codex:rescue` pattern).
- Installation now includes a numbered 4-step recipe (marketplace add →
  install → restart → verify with `/help` and `/agents`).
- New troubleshooting row: "슬래시 커맨드가 안 보임" → restart + `/help`.

### Notes
- No code changes. `plugin.json` and `marketplace.json` version bumped
  to `0.5.0` to reflect the user-facing surface change (intentional
  minor bump under the pre-1.0 convention).

## [0.4.0] — 2026-05-14

### Added
- `plugins/glm/skills/glm-cli-runtime/SKILL.md` — runtime contract for
  invoking `glm-companion`. Documents subcommand exit codes, env-var
  overrides, foreground vs background trade-offs, and failure recovery
  sequence.
- `plugins/glm/skills/glm-result-handling/SKILL.md` — output presentation
  rules: canonical `## GLM Response` header, verbatim forwarding,
  symptom→action table for empty/truncated/refusal outputs, background
  job follow-up flow.
- `plugins/glm/skills/glm-5-1-prompting/SKILL.md` + 3 references:
  - `references/prompt-blocks.md` — persona blocks, output-format blocks,
    verification blocks, refusal blocks, depth hints, Korean quirks.
  - `references/glm-prompt-recipes.md` — five composed templates (review,
    refactor, design exploration, bug diagnosis, documentation).
  - `references/glm-prompt-antipatterns.md` — ten failure modes with
    bad/good rewrites (vague verbs, mixed-purpose, no output format,
    buried instructions, fuzzy confidence, JSON without schema, etc.).
- `tests/skills.test.mjs` — frontmatter, body, reference files, and
  cross-link validation.
- `LICENSE` (MIT).

### Changed
- Plugin version bumped to `0.4.0` in `plugin.json` and `marketplace.json`.
- `README.md` — Skills section, Troubleshooting section, roadmap v0.4.0 ✅.

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
