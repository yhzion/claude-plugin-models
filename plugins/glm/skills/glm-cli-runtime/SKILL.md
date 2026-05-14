---
name: glm-cli-runtime
description: Use when a Claude Code agent (especially the `glm-rescue` agent) needs to invoke the `glm-companion` CLI to delegate work to z.ai's GLM-5.1. Covers subcommand contracts, exit codes, env variable overrides, foreground vs background semantics, and the canonical failure-recovery sequence.
---

# glm-cli-runtime

This is the runtime contract for talking to `glm-companion.mjs`. Follow it exactly. Deviating breaks job tracking and makes failures hard to diagnose.

## The single entry point

Always go through:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" <subcommand> [flags]
```

Never call `claude -p` directly. The companion owns: job ID generation, atomic state writes, log file management, subprocess lifecycle, and `--dangerously-skip-permissions` plumbing.

## Subcommand contracts

Each subcommand exits 0 on success, non-zero on failure. With `--json`, the companion always emits a single JSON object on stdout (even on failure) so you can parse the result branch.

| Subcommand | Required args | Key flags | What it does |
|---|---|---|---|
| `setup` | — | `--json` | Verifies `~/.claude/settings.glm.json` exists and has `env.ANTHROPIC_AUTH_TOKEN` + `env.ANTHROPIC_BASE_URL`. Reports `{ok, settingsPath, model, baseUrl}`. |
| `task <prompt>` | prompt | `--background`, `--write`, `--json`, `--id <id>` | Runs GLM. Foreground blocks; background returns immediately with the job id. Records a job (`jobClass: "task"`). |
| `review` | — (uses git diff) | `--scope auto\|working-tree\|branch`, `--base <ref>`, `--background`, `--json` | Collects a diff, fills `prompts/review.md`, dispatches as a `jobClass: "review"` job. |
| `status [<id>]` | optional id | `--json`, `--all` | No id → most-recent-first table. With id → single record. |
| `result <id>` | id | `--json` | Reads the job's `logFile` (GLM's stdout) and returns it. Streams partial output for running jobs. |
| `cancel <id>` | id | `--json` | SIGTERM the job's PID if still running. Idempotent. |

## Probe before you act

For any non-trivial dispatch, probe `setup --json` first:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" setup --json
```

- `{ok: true}` → proceed.
- `{ok: false}` → stop. Tell the parent to run `/glm:setup` (or guide the user to create `~/.claude/settings.glm.json` manually if `/glm:setup` is not available). Do **not** attempt to call `task` or `review` — they will fail with the same error and waste time.

## Foreground vs background

| Choose foreground when | Choose background when |
|---|---|
| User asked a question and wants the answer now | User said "백그라운드", "rescue", "오래 걸리는" |
| Expected GLM response time < 60s | Large refactor, big repo review |
| Output should be inline in the current conversation | Result will be picked up later via `/glm:result` |
| Prompt is short, deterministic | Prompt is huge and might hit per-call timeouts |

Default to foreground unless the user signals otherwise or the request is clearly long-running.

## Env variables (test/dev override)

- `GLM_SETTINGS_PATH` — point at a different settings file. Used in tests and for users who want a per-project GLM token.
- `GLM_JOBS_DIR` — relocate job state. Default `~/.claude/glm-jobs/default/`.
- `GLM_CLAUDE_BIN` — override the `claude` binary path. Used in tests to inject a deterministic mock.

If you need to invoke the companion against an alternate settings file (e.g., for a sandboxed test), pass `GLM_SETTINGS_PATH` in the env, not as a CLI flag.

## Failure recovery sequence

When a `task` or `review` call exits non-zero:

1. **Read the JSON envelope** (always present with `--json`). Look at `error`.
2. **Classify the error**:
   - `Settings file does not exist` → run `/glm:setup`, then retry.
   - `Not a git repository` (review only) → tell the user where you're running.
   - `Nothing to review` (review only) → suggest `--base <ref>` or `--scope branch`.
   - Network / auth / 401 → surface the stderr verbatim. The user's z.ai token may be expired.
   - Empty output, exit 0 → fetch via `/glm:result <id>` and inspect the log file directly.
3. **Do not silently retry**. Two failed calls cost roughly the same as one successful call to the user's z.ai quota.

## Long prompts

`task <prompt>` accepts the prompt as a single argv. On Linux that's bounded by `ARG_MAX` (typically 128 KB). For larger prompts:

- Write the prompt to a temp file.
- Pass via shell substitution: `node ... task "$(<\/tmp/prompt.txt)"`.
- Or use a heredoc-fed wrapper script.

The companion does not (yet) accept stdin in v0.4.0 — that's a follow-up.

## See also

- `[[glm-result-handling]]` — how to interpret and present what comes back from a job.
- `[[glm-5-1-prompting]]` — how to assemble the prompt you hand to `task` or how to extend `prompts/review.md`.
