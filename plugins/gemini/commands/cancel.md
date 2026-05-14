---
description: Cancel a running Gemini background job.
allowed-tools: ["Bash"]
argument-hint: "<job-id> [--json]"
---

You are running the `/gemini:cancel` command.

The user must provide a job id. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" cancel <job-id>
```

The companion sends `SIGTERM` to the job's **process group** (gemini spawns Python worker threads — the parent alone won't terminate them), waits ~2 seconds, then escalates to `SIGKILL` if still alive. It is idempotent — cancelling an already-cancelled or already-completed job updates the record's status but does no kill.

If the user passed `--json`, pass it through. The JSON includes a `cancel` field with `{ signalSent, escalated, alive }` so you can see whether SIGKILL was needed. If the job id is unknown, surface the companion's error message.
