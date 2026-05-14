---
description: Delegate a task to Gemini (foreground or background) and track it as a job.
allowed-tools: ["Bash", "Read", "Grep", "Glob"]
argument-hint: "[--background] [--model <name>] [--write] <prompt>"
---

You are running the `/gemini:rescue` command. Your job is to package the user's request into a self-contained prompt and hand it to the `gemini-companion` CLI to delegate to Gemini.

## Step 1: Build a self-contained prompt

Gemini has no conversation history. Construct a prompt with these sections:

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

- **Foreground (default)**: user wants the answer right now. The companion blocks until Gemini responds and streams the output back.
- **Background**: user passed `--background`, OR the task is long-running. Returns immediately with a job id; user later runs `/gemini:result <id>`.

## Step 3: Invoke the companion

Foreground:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" task "<self-contained prompt>"
```

Background:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" task --background "<self-contained prompt>"
```

Optional `--model <name>`: defaults to gemini CLI's routing (`auto-gemini-3` → currently `gemini-3.1-pro-preview`). Pass `--model gemini-2.5-flash` for cheaper/faster, or any other Gemini model the user has access to.

If the prompt is long, write it to a temp file and pass it via `$(cat /tmp/file)` substitution to avoid argv length limits.

## Step 4: Present the result

Foreground — wrap Gemini's stdout under a clear header:

```
## Gemini Response
[verbatim stdout from the companion]
```

Background — show the job id and follow-up commands:

```
Gemini is working on this in the background.

  Job id: <id>
  Check status:  /gemini:status <id>
  Get result:    /gemini:result <id>
  Cancel:        /gemini:cancel <id>
```

## Failure modes

- **`gemini CLI not found`** → tell the user to run `/gemini:setup` for install guidance.
- **Exit 41 / `unauthenticated`** → tell the user to run `/gemini:setup`.
- **Non-zero exit otherwise** → surface stderr verbatim. Do not silently retry.
- **Empty output** → check the job log via `/gemini:result <id>` to inspect what Gemini actually emitted.
