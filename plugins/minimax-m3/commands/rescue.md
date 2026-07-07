---
description: Delegate a task to the self-hosted MiniMax-M3 model (foreground or background) and track it as a job.
allowed-tools: ["Bash", "Read", "Grep", "Glob"]
argument-hint: "[--background] [--write] <prompt>"
---

You are running the `/minimax-m3:rescue` command. Your job is to package the user's request into a self-contained prompt and hand it to the `minimax-m3-companion` CLI to delegate to the self-hosted MiniMax-M3 model.

## Step 1: Build a self-contained prompt

MiniMax-M3 has no conversation history. Construct a prompt with these sections:

```
## Background
[Summarize what was just discussed in the parent conversation, if relevant.]

## Request
[The user's actual task.]

## Context
[If the user referenced files, paste their contents here. If they asked about recent changes, include `git diff` output. Keep it tight.]
```

Read referenced files yourself first so the context is embedded.

## Step 2: Decide foreground vs background

- **Foreground (default)**: user wants the answer right now. The companion blocks until MiniMax-M3 responds and streams the output back.
- **Background**: user passed `--background`, OR the task is long-running. Returns immediately with a job id; user later runs `/minimax-m3:result <id>`.

## Step 3: Verify auth is wired

Before invoking the companion, make sure the bunker key is loaded. Run a quick env check:

```bash
[ -n "${BUNKER_KEY:-}" ] && [ -r "$HOME/.bunker/key.env" ] && source "$HOME/.bunker/key.env" && export ANTHROPIC_AUTH_TOKEN="$BUNKER_KEY" ANTHROPIC_API_KEY="$BUNKER_KEY"
```

If `BUNKER_KEY` is not set and `~/.bunker/key.env` does not exist, **stop and tell the user** to run `/minimax-m3:setup` (which will surface the missing key file) — do not call the companion with an unset auth token.

## Step 4: Invoke the companion

Foreground:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/minimax-m3-companion.mjs" task "<self-contained prompt>"
```

Background:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/minimax-m3-companion.mjs" task --background "<self-contained prompt>"
```

If the prompt is long, write it to a temp file and pass it via shell `$(< /tmp/minimax-m3-prompt.txt)` substitution to avoid argv length limits.

## Step 5: Present the result

Foreground — wrap MiniMax-M3's stdout under a clear header:

```
## MiniMax-M3 Response
[verbatim stdout from the companion]
```

Background — show the job id and the follow-up commands:

```
MiniMax-M3 is working on this in the background.

  Job id: <id>
  Check status:  /minimax-m3:status <id>
  Get result:    /minimax-m3:result <id>
  Cancel:        /minimax-m3:cancel <id>
```

## Failure modes

- **`Settings file does not exist`** → tell the user to run `/minimax-m3:setup` first.
- **Auth failure / 401 / 403** → bunker key is missing, expired, or revoked. Surface stderr verbatim and tell the user to check `~/.bunker/key.env`.
- **Network / timeout** → bunker-llm may be down. Surface stderr verbatim.
- **Non-zero exit** → surface the stderr verbatim. Do not silently retry.
- **Empty output** → check the job log via `/minimax-m3:result <id>` to inspect what MiniMax-M3 actually emitted.
