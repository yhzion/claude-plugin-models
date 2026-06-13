---
description: Delegate a task to opencode (foreground or background) and track it as a job.
allowed-tools: ["Bash", "Read", "Grep", "Glob"]
argument-hint: "[--background] [--model <provider/model>] <prompt>"
---

You are running the `/opencode:rescue` command. Your job is to package the user's request into a self-contained prompt and hand it to the `opencode-companion` CLI to delegate to opencode.

## Step 1: Build a self-contained prompt

opencode runs in a fresh session with no access to this conversation. Construct a prompt with these sections:

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

- **Foreground (default)**: user wants the answer right now. The companion blocks until opencode responds and streams the output back.
- **Background**: user passed `--background`, OR the task is long-running (large refactor, comprehensive review). Returns immediately with a job id; user later runs `/opencode:result <id>`.

## Step 3: Model selection

By default, **omit the model** — opencode uses its own default (last-used) model. Only pass `--model <provider/model>` (e.g. `--model anthropic/claude-opus-4-8`) if the user explicitly asked for a specific model.

## Step 4: Invoke the companion

Foreground:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-companion.mjs" task "<self-contained prompt>"
```

Background:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-companion.mjs" task --background "<self-contained prompt>"
```

With an explicit model:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-companion.mjs" task --model <provider/model> "<self-contained prompt>"
```

If the prompt is long, write it to a temp file and pass it via shell `"$(< /tmp/opencode-prompt.txt)"` substitution to avoid argv length limits.

## Step 5: Present the result

Foreground — wrap opencode's stdout under a clear header:

```
## opencode Response
[verbatim stdout from the companion]
```

Background — show the job id and the follow-up commands:

```
opencode is working on this in the background.

  Job id: <id>
  Check status:  /opencode:status <id>
  Get result:    /opencode:result <id>
  Cancel:        /opencode:cancel <id>
```

## Failure modes

- **`opencode CLI not found`** → tell the user to install opencode (https://opencode.ai) or run `/opencode:setup`.
- **Non-zero exit** → surface the stderr verbatim. If it mentions no model/credentials, tell the user to run `/opencode:setup`. Do not silently retry.
- **Empty output** → check the job log via `/opencode:result <id>` to inspect what opencode actually emitted.
