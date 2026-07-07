---
name: minimax-m3-cli-runtime
description: Use when a Claude Code agent (especially the `minimax-m3-rescue` agent) needs to invoke the `minimax-m3-companion` CLI to delegate work to the self-hosted MiniMax-M3 model via bunker-llm. Covers subcommand contracts, exit codes, env variable overrides, foreground vs background semantics, and the canonical failure-recovery sequence.
---

# minimax-m3-cli-runtime

This is the runtime contract for talking to `minimax-m3-companion.mjs`. Follow it exactly. Deviating breaks job tracking and makes failures hard to diagnose.

## The single entry point

Always go through:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/minimax-m3-companion.mjs" <subcommand> [flags]
```

Never call `claude -p` directly. The companion owns: job ID generation, atomic state writes, log file management, subprocess lifecycle, and `--dangerously-skip-permissions` plumbing.

## Subcommand contracts

Each subcommand exits 0 on success, non-zero on failure. With `--json`, the companion always emits a single JSON object on stdout (even on failure) so you can parse the result branch.

| Subcommand | Required args | Key flags | What it does |
|---|---|---|---|
| `setup` | — | `--json` | Verifies `~/.claude/settings.minimax-m3.json` exists and has `env.ANTHROPIC_BASE_URL`. Reports `{ok, settingsPath, model, baseUrl}`. Note: it does NOT check for `ANTHROPIC_AUTH_TOKEN` — see the Authentication section. |
| `task <prompt>` | prompt | `--background`, `--write`, `--json`, `--id <id>` | Runs MiniMax-M3. Foreground blocks; background returns immediately with the job id. Records a job (`jobClass: "task"`). |
| `status [<id>]` | optional id | `--json` | No id → most-recent-first table. With id → single record. |
| `result <id>` | id | `--json` | Reads the job's `logFile` (MiniMax-M3's stdout) and returns it. Streams partial output for running jobs. |
| `cancel <id>` | id | `--json` | SIGTERM the job's PID if still running. Idempotent. |

## Authentication — the part that's different from glm

MiniMax-M3 **does not** store the API key in the settings file. The key lives in `~/.bunker/key.env` (chmod 600) and is sourced by the user's shell or wrapper before `claude` is invoked — the same pattern as the existing `~/bin/claude-minimax-m3` script.

Concretely:

- `setup` only checks `ANTHROPIC_BASE_URL`, not `ANTHROPIC_AUTH_TOKEN`. It returns `ok=true` as long as the URL is present. **This is by design.**
- The companion shells out to `claude --settings ~/.claude/settings.minimax-m3.json ...`. That settings file sets `ANTHROPIC_BASE_URL` and the model routing, but not the token.
- The token comes from the ambient environment when `claude` is launched. If `BUNKER_KEY` is unset and `~/.bunker/key.env` is not sourced, `claude` will fail with 401/403.

Before dispatching (foreground or background), confirm the auth is wired:

```bash
[ -n "${BUNKER_KEY:-}" ] || [ -r "$HOME/.bunker/key.env" ] && source "$HOME/.bunker/key.env"
[ -n "${BUNKER_KEY:-}" ] || { echo "BUNKER_KEY missing — source ~/.bunker/key.env first" >&2; exit 1; }
```

If this fails, stop and tell the parent to fix the wrapper / shell config. Do not call `task` against an unwired environment — it will burn API quota on a guaranteed 401.

## Probe before you act

For any non-trivial dispatch, probe `setup --json` first:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/minimax-m3-companion.mjs" setup --json
```

- `{ok: true}` → proceed. (And separately, verify `~/.bunker/key.env` exists.)
- `{ok: false}` → stop. Tell the parent to run `/minimax-m3:setup` (or guide the user to create `~/.claude/settings.minimax-m3.json` manually if `/minimax-m3:setup` is not available). Do **not** attempt to call `task` — it will fail with the same error and waste time.

## Foreground vs background

| Choose foreground when | Choose background when |
|---|---|
| User asked a question and wants the answer now | User said "백그라운드", "rescue", "오래 걸리는" |
| Expected MiniMax-M3 response time < 60s | Large refactor, big code dump |
| Output should be inline in the current conversation | Result will be picked up later via `/minimax-m3:result` |
| Prompt is short, deterministic | Prompt is huge and might hit per-call timeouts |

Default to foreground unless the user signals otherwise or the request is clearly long-running.

## Env variables (test/dev override)

- `MINIMAX_M3_SETTINGS_PATH` — point at a different settings file. Used in tests and for users who want a per-project MiniMax-M3 config.
- `MINIMAX_M3_JOBS_DIR` — relocate job state. Default `~/.claude/minimax-m3-jobs/default/`.
- `MINIMAX_M3_CLAUDE_BIN` — override the `claude` binary path. Used in tests to inject a deterministic mock.
- `MINIMAX_M3_CLAUDE_EFFORT` — override the default `--effort max`. Set to `''` to disable the flag entirely.

If you need to invoke the companion against an alternate settings file (e.g., for a sandboxed test), pass `MINIMAX_M3_SETTINGS_PATH` in the env, not as a CLI flag.

## Failure recovery sequence

When a `task` call exits non-zero:

1. **Read the JSON envelope** (always present with `--json`). Look at `error`.
2. **Classify the error**:
   - `Settings file does not exist` → run `/minimax-m3:setup`, then retry.
   - 401 / 403 in stderr → `BUNKER_KEY` missing/expired. Check `~/.bunker/key.env`, re-source, retry.
   - Network / connection refused → bunker-llm may be down. Surface stderr verbatim.
   - Empty output, exit 0 → fetch via `/minimax-m3:result <id>` and inspect the log file directly.
3. **Do not silently retry**. Two failed calls cost the same as one successful call to the user's bunker quota.

## Long prompts

`task <prompt>` accepts the prompt as a single argv. On Linux that's bounded by `ARG_MAX` (typically 128 KB). For larger prompts:

- Write the prompt to a temp file.
- Pass via shell substitution: `node ... task "$(<\/tmp/prompt.txt)"`.
- Or use a heredoc-fed wrapper script.

The companion does not (yet) accept stdin — that's a follow-up.

## See also

- `[[minimax-m3-result-handling]]` — how to interpret and present what comes back from a job.
- `[[minimax-m3-prompting]]` — how to assemble the prompt you hand to `task`.
