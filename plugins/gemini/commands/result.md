---
description: Fetch the captured output of a completed or running Gemini job.
allowed-tools: ["Bash"]
argument-hint: "<job-id> [--json]"
---

You are running the `/gemini:result` command.

The user must provide a job id. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" result <job-id>
```

The companion prints the contents of the job's log file (Gemini's stdout). For background jobs that are still running, this returns whatever has been written so far. If the job failed, it also prints any captured stderr.

Present the output to the user under a clear header:

```
## Gemini Response (job <id>, status=<status>)
[verbatim output from the companion]
```

If the user passed `--json`, pass it through and emit the JSON verbatim. If the job id is unknown, surface the companion's error message.
