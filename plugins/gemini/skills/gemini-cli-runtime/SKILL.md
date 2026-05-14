---
name: gemini-cli-runtime
description: Use when a Claude Code agent (especially the `gemini-rescue` agent) needs to invoke the `gemini-companion` CLI to delegate work to Google's Gemini model. Covers subcommand contracts, exit codes (notably 41 = unauthenticated), env variable overrides, foreground vs background semantics, the SIGTERM/SIGKILL cancel protocol, and the canonical failure-recovery sequence.
---

# gemini-cli-runtime

This is the runtime contract for talking to `gemini-companion.mjs`. Follow it exactly. Deviating breaks job tracking and makes failures hard to diagnose.

## The single entry point

Always go through:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" <subcommand> [flags]
```

Never call `gemini -p` directly. The companion owns: job ID generation, atomic state writes, log file management, subprocess lifecycle, **process-group cancellation**, and exit-code classification.

## Subcommand contracts

Each subcommand exits 0 on success, non-zero on failure. With `--json`, the companion always emits a single JSON object on stdout (even on failure) so you can parse the result branch.

| Subcommand | Required args | Key flags | What it does |
|---|---|---|---|
| `setup` | — | `--json`, `--skip-probe` | Verifies the `gemini` binary exists, then probes auth via a 1-token call. Reports `{ok, version, probed}`. With `--skip-probe`, only checks the binary. |
| `task <prompt>` | prompt | `--background`, `--write`, `--model <name>`, `--json`, `--id <id>` | Runs gemini. Foreground blocks; background returns immediately with the job id. Records a job (`jobClass: "task"`). |
| `review` | — (uses git diff) | `--scope auto\|working-tree\|branch`, `--base <ref>`, `--model <name>`, `--background`, `--json` | Collects a diff, fills `prompts/review.md`, dispatches as a `jobClass: "review"` job. |
| `status [<id>]` | optional id | `--json` | No id → most-recent-first table. With id → single record. |
| `result <id>` | id | `--json` | Reads the job's `logFile` (gemini's stdout) and returns it. Streams partial output for running jobs. |
| `cancel <id>` | id | `--json` | Process-group SIGTERM (then SIGKILL escalation) the job's PID if still running. Idempotent. |

## Probe before you act

For any non-trivial dispatch, probe `setup --json` first:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" setup --json
```

- `{ok: true, probed: true}` → proceed. Auth is verified.
- `{ok: false, reason: "unauthenticated"}` → stop. Tell the parent to run `/gemini:setup`. The user must complete OAuth interactively (`gemini` in a terminal) or export `GEMINI_API_KEY`.
- `{ok: false, error: "gemini CLI not found..."}` → stop. The user must install the gemini CLI from https://github.com/google-gemini/gemini-cli.
- `{ok: false, reason: "probe-failed"}` → network/quota issue. Surface the stderr verbatim.

Do **not** attempt to call `task` or `review` if setup fails — they will fail with the same error and the call counts against the user's quota.

## Exit codes worth knowing

| Exit | Meaning | What to do |
|---|---|---|
| `0` | Success | Present `stdout` |
| `41` | Unauthenticated (no OAuth or `GEMINI_API_KEY`) | Tell the user to run `/gemini:setup` and follow the hint. Do not retry. |
| `124` | Timeout (SIGTERM via spawn timeout) | Probe likely hung — network or auth handshake. |
| Other non-zero | Other failure | Surface stderr verbatim. |

Unlike GLM (which uses `~/.claude/settings.glm.json` as the auth anchor), Gemini auth is fully owned by the gemini CLI under `~/.gemini/oauth_creds.json` or env vars. The companion never writes credentials.

## Foreground vs background

| Choose foreground when | Choose background when |
|---|---|
| User asked a question and wants the answer now | User said "백그라운드", "rescue", "오래 걸리는" |
| Expected gemini response time < 60s | Large refactor, big repo review, long-context analysis |
| Output should be inline in the current conversation | Result will be picked up later via `/gemini:result` |
| Prompt is short, deterministic | Prompt is huge and might exceed timeout budget |

Default to foreground unless the user signals otherwise or the request is clearly long-running.

## Cancellation: why it's non-trivial

The `gemini` CLI is a Node.js binary with **no signal handlers** — it ignores plain `SIGTERM`/`SIGINT` sent to its PID. The companion works around this:

1. Background jobs are spawned with `detached: true`, making the child a process-group leader.
2. `cancel` sends `SIGTERM` to `-pid` (the whole group), waits ~2s, then escalates to `SIGKILL` if still alive.

If you ever invoke the gemini CLI outside the companion, **you cannot reliably cancel it**. Always go through the companion's `cancel` subcommand.

## Env variables (test/dev override)

- `GEMINI_BIN` — override the `gemini` binary path. Used in tests to inject a deterministic mock (e.g., `/bin/true`).
- `GEMINI_JOBS_DIR` — relocate job state. Default `~/.claude/gemini-jobs/default/`.
- `GEMINI_MODEL` — set the default model name passed via `-m` (e.g., `gemini-2.5-flash`). Per-call `--model` flag wins.

## Failure recovery sequence

When a `task` or `review` call exits non-zero:

1. **Read the JSON envelope** (always present with `--json`). Look at `error` and `code`.
2. **Classify the error**:
   - `code: 41` / `error: "...Auth method..."` → run `/gemini:setup`, then retry only after the user completes OAuth.
   - `error: "gemini CLI not found..."` → tell the user to install the CLI.
   - `Not a git repository` (review only) → tell the user where you're running.
   - `Nothing to review` (review only) → suggest `--base <ref>` or `--scope branch`.
   - Quota / 429 → surface stderr verbatim. Suggest `--model gemini-2.5-flash` for a cheaper retry.
   - Empty output, exit 0 → fetch via `/gemini:result <id>` and inspect the log file.
3. **Do not silently retry**. Two failed calls cost roughly the same as one successful call against the user's gemini quota.

## Long prompts

`task <prompt>` accepts the prompt as a single argv. On Linux that's bounded by `ARG_MAX` (typically 128 KB). Gemini's context window is large — you may legitimately want to send a lot. For prompts larger than ~64 KB:

- Write the prompt to a temp file.
- Pass via shell substitution: `node ... task "$(<\/tmp/prompt.txt)"`.

The companion does not (yet) accept stdin in v0.1.0 — that's a follow-up.

## See also

- `[[gemini-result-handling]]` — how to interpret and present what comes back from a job.
- `[[gemini-prompting]]` — how to assemble the prompt you hand to `task`, or how to extend `prompts/review.md`.
