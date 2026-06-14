---
description: Delegate a task to the pi coding agent (foreground or background) and track it as a job.
allowed-tools: ["Bash", "Read", "Grep", "Glob"]
argument-hint: "[--background] [--model <provider/model>] <prompt>"
---

You are running the `/pi:rescue` command. Your job is to package the user's request into a self-contained prompt and hand it to the `pi-companion` CLI to delegate to the pi coding agent.

## Step 1: Build a self-contained prompt

pi runs in a fresh session with no access to this conversation. Construct a prompt with these sections:

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

- **Foreground (default)**: user wants the answer right now. The companion blocks until pi responds and streams the output back.
- **Background**: user passed `--background`, OR the task is long-running (large refactor, comprehensive review). Returns immediately with a job id; user later runs `/pi:result <id>`.

## Step 3: Model selection

By default, **omit the model** — pi uses its own default (configured) provider/model. Only pass `--model <provider/model>` (e.g. `--model anthropic/claude-opus-4-8`, or a shorthand like `--model sonnet:high`) if the user explicitly asked for a specific model.

## Step 4: Invoke the companion

Foreground:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pi-companion.mjs" task "<self-contained prompt>"
```

Background:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pi-companion.mjs" task --background "<self-contained prompt>"
```

With an explicit model:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pi-companion.mjs" task --model <provider/model> "<self-contained prompt>"
```

If the prompt is long, write it to a temp file and pass it via shell `"$(< /tmp/pi-prompt.txt)"` substitution to avoid argv length limits.

## Step 5: Present the result

Foreground — wrap pi's stdout under a clear header:

```
## pi Response
[verbatim stdout from the companion]
```

Background — show the job id and the follow-up commands:

```
pi is working on this in the background.

  Job id: <id>
  Check status:  /pi:status <id>
  Get result:    /pi:result <id>
  Cancel:        /pi:cancel <id>
```

## Failure modes

- **`pi CLI not found`** → tell the user to install pi (https://pi.dev) or run `/pi:setup`.
- **Non-zero exit** → surface the stderr verbatim. If it mentions no model/credentials, tell the user to run `/pi:setup`. Do not silently retry.
- **Empty output** → check the job log via `/pi:result <id>` to inspect what pi actually emitted.
