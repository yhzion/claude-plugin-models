# Changelog

All notable changes to this project will be documented in this file.

## [0.10.0] — 2026-07-16

### Changed
- **`glm` 플러그인 `0.6.0`** — agent description 트림(role+trigger-phrase
  단문 형식, `<example>` 블록 제거)과 문서 동기화(설정 파일이 model id의
  단일 출처임을 명시하는 표현으로 정리)를 반영. `check-stale.mjs` 주석의
  `GLM-5.1` 고정 표기를 버전 무관 `GLM-5.x` 표기로 수정.
  `.claude-plugin/marketplace.json`의 `glm` 엔트리 `description`도
  `"Delegate tasks to z.ai's GLM model (model id from
  ~/.claude/settings.glm.json) via claude -p subprocess."`로 갱신 —
  이전에 남아있던 `GLM-5.1` 하드코딩 표기를 제거.
  - `commands/setup.md`의 설정 파일 예시 템플릿을 `"model": "glm-5.1"`에서
    `"model": "glm-5.2[1m]"`로 갱신한 수정(커밋 `a6cea2b`, 2026-07-05)은
    이전에 CHANGELOG 버전 항목 없이 커밋만 되어 있던 상태였습니다. 이번
    `0.6.0`에서 정식으로 버전에 반영되어 출시됩니다.
- **`gemini`/`opencode`/`pi`/`minimax-m3` 플러그인 각 `0.2.0`** — 4개
  플러그인의 agent description을 동일한 role+trigger-phrase 단문
  형식으로 트림(`<example>`/`<commentary>` 블록 제거, 세션당 컨텍스트
  절감).
- `.claude-plugin/marketplace.json`: 5개 플러그인 엔트리의 `version`을
  각 플러그인의 새 버전과 일치시키고, `metadata.version`을 `0.9.0` →
  `0.10.0`으로 갱신.

### Notes
- `agents/glm.md:61`, `agents/glm-rescue.md:28`의 본문 설명 문장에는
  `glm-5.2[1m]` 하드코딩이 여전히 남아 있어 `check-stale.mjs` 실행 시
  현재도 exit 1을 반환합니다 — 이번 릴리스 이전부터 알려진 후속 정리
  항목이며, 이번 릴리스에서 수정하지 않았습니다.

## [0.7.0] — 2026-07-07

### Added
- **`minimax-m3` 플러그인 v0.1.0** — 셀프호스팅된 MiniMax-M3 모델을
  bunker-llm (Anthropic 호환 프록시) 경유로 Claude Code에 연결.
  - `plugins/minimax-m3/.claude-plugin/plugin.json` (v0.1.0).
  - `plugins/minimax-m3/agents/{minimax-m3,minimax-m3-rescue}.md` — 단순
    위임 + 잡 라이프사이클 두 가지 에이전트.
  - `plugins/minimax-m3/commands/{setup,rescue,status,result,cancel}.md` —
    슬래시 커맨드 5종. v0.1.0에서는 `review` 제외 (git-diff 리뷰 워크플로우는
    후속 버전에서 검토).
  - `plugins/minimax-m3/scripts/minimax-m3-companion.mjs` — CLI 오케스트레이터.
    `claude --settings ~/.claude/settings.minimax-m3.json -p` 서브프로세스 호출
    + 잡 트래킹.
  - `plugins/minimax-m3/scripts/lib/{state,claude-runner,git}.mjs` — 잡 상태
    원자적 쓰기 / `detached: true` spawn + process-group cancel / git diff
    헬퍼 (glm과 동일한 패턴).
  - `plugins/minimax-m3/skills/{minimax-m3-cli-runtime,minimax-m3-prompting,
    minimax-m3-result-handling}/SKILL.md` — MiniMax-M3 전용 스킬 3종.
- `.claude-plugin/marketplace.json`: `minimax-m3` 엔트리 추가, 메타데이터
  버전 `0.6.0` → `0.7.0`, description에 MiniMax-M3 명시.
- `tests/minimax-m3-{manifest,marketplace,commands}.test.mjs`,
  `tests/smoke-minimax-m3.test.mjs` — manifest 검증, marketplace 등록 검증,
  5개 슬래시 커맨드 + companion `--help` 검증.
- `CLAUDE.md`: `minimax-m3`를 `Current plugins` 줄에 추가, 인증 모델
  (`~/.bunker/key.env` 분리)을 Conventions에 명시.
- `README.md`: 설치/검증 섹션에 `/minimax-m3:*` 슬래시 커맨드 + 인증 요구사항
  추가. (이전 임시 편집으로 남아있던 `opencode`/`pi` 미출시 슬롯은 "미출시"
  표기 유지.)

### Authentication notes
- minimax-m3은 `ANTHROPIC_AUTH_TOKEN`을 settings 파일에 저장하지 **않습니다**.
  키는 사용자 wrapper/shell이 `BUNKER_KEY` 환경변수 또는 `~/.bunker/key.env`
  (mode 600)를 통해 주입. `/minimax-m3:setup`은 settings 파일의 URL/routing만
  검증하고 키 자체는 건드리지 않습니다.

### Removed
- `tests/opencode-{commands,manifest,marketplace}.test.mjs`,
  `tests/smoke-opencode.test.mjs` — 이전에 미완성 상태로 남아있던 opencode
  플러그인 시도 잔재. (opencode 자체의 시장성/요구사항이 정리되지 않아
  제거.)

## [0.6.0] — 2026-05-14

### Added
- **`gemini` 플러그인 MVP (Phase 2)** — `plugins/gemini/` 신규.
  - `plugins/gemini/.claude-plugin/plugin.json` (v0.1.0).
  - `plugins/gemini/agents/{gemini,gemini-rescue}.md` — 위임 / 잡 라이프사이클
    트래킹 두 가지 에이전트.
  - `plugins/gemini/commands/{setup,rescue,review,status,result,cancel}.md` —
    슬래시 커맨드 6종.
  - `plugins/gemini/scripts/gemini-companion.mjs` — CLI 오케스트레이터.
    `gemini -p` 서브프로세스 호출 + 잡 트래킹.
  - `plugins/gemini/scripts/lib/{state,gemini-runner,git}.mjs` — 잡 상태
    원자적 쓰기 / `detached: true` spawn + process-group cancel / git diff
    헬퍼.
- `plugins/gemini/prompts/review.md`, `schemas/review-output.schema.json` —
  `/gemini:review` 템플릿과 출력 구조 스키마 (GLM 동일 구조 미러).
- `plugins/gemini/skills/{gemini-cli-runtime,gemini-result-handling,gemini-prompting}/SKILL.md`
  — Gemini 전용 스킬 3종. OAuth/`GEMINI_API_KEY` 인증, exit code 41
  (unauthenticated) 처리, `gemini-3.1-pro-preview` vs `gemini-2.5-flash`
  모델 선택 가이드 포함.
- `.claude-plugin/marketplace.json`: `gemini` 엔트리 추가, 메타데이터
  버전 `0.5.0` → `0.6.0`, description에 Gemini 명시.

### Notes
- `gemini` CLI는 SIGTERM/SIGINT 시그널을 자체적으로 무시(Node CLI without
  signal handlers). 백그라운드 잡 cancel은 `spawn(..., { detached: true })`로
  새 process group을 만든 뒤 `process.kill(-pid, ...)`로 그룹 전체 SIGTERM,
  실패 시 SIGKILL escalation. 이 메커니즘이 `lib/gemini-runner.mjs`의
  `cancelGeminiProcess()`에 캡슐화돼 있음.
- GLM과 달리 settings 파일을 작성하지 *않음*. `gemini` CLI가 자체 OAuth
  (`~/.gemini/oauth_creds.json`) 또는 `GEMINI_API_KEY` env로 관리.
  `/gemini:setup`은 readiness checker 전용.
- `glm` 플러그인 버전(`plugin.json`)은 `0.5.0` 그대로 유지. 본 릴리스는
  GLM 코드/스킬 변경 없음 — 마켓플레이스 메타데이터만 `0.6.0`.

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
