---
description: Delegate a task to GLM-5.1 (foreground or background) and track it as a job.
allowed-tools: ["Bash", "Read", "Grep", "Glob"]
argument-hint: "[--background] [--write] <prompt>"
---

You are running the `/glm:rescue` command. Your job is to package the user's request into a self-contained prompt and hand it to the `glm-companion` CLI to delegate to GLM-5.1.

## Step 1: Build a self-contained prompt

GLM has no conversation history. Construct a prompt with these sections:

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

- **Foreground (default)**: user wants the answer right now. The companion blocks until GLM responds and streams the output back.
- **Background**: user passed `--background`, OR the task is long-running (large refactor, comprehensive review). Returns immediately with a job id; user later runs `/glm:result <id>`.

## Step 3: Invoke the companion

Foreground:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" task "<self-contained prompt>"
```

Background:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" task --background "<self-contained prompt>"
```

If the prompt is long, write it to a temp file and pass it via shell `$(< /tmp/glm-prompt.txt)` substitution to avoid argv length limits.

## Step 4: Present the result

Foreground — wrap GLM's stdout under a clear header:

```
## GLM Response
[verbatim stdout from the companion]
```

Background — show the job id and the follow-up commands:

```
GLM is working on this in the background.

  Job id: <id>
  Check status:  /glm:status <id>
  Get result:    /glm:result <id>
  Cancel:        /glm:cancel <id>
```

## Failure modes

- **`Settings file does not exist`** → tell the user to run `/glm:setup` first.
- **Non-zero exit** → surface the stderr verbatim. Do not silently retry.
- **Empty output** → check the job log via `/glm:result <id>` to inspect what GLM actually emitted.
