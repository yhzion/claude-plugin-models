---
description: List Gemini jobs (or inspect a specific job by id).
allowed-tools: ["Bash"]
argument-hint: "[<job-id>] [--json]"
---

You are running the `/gemini:status` command.

Run the companion. If the user passed a job id, include it as the first positional arg. If they passed `--json`, pass it through and emit the JSON verbatim.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" status [<args>]
```

The companion will return either:

- A table of jobs sorted by most-recent first (id, status, updatedAt, prompt preview).
- A single job's detailed record if you provided an id.
- `No jobs.` if the jobs directory is empty.

Present the companion's output to the user as-is. Do not summarize or filter — they want raw status. If the user passed an unknown job id, the companion will exit non-zero with an error message; surface that message.
