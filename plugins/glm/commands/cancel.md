---
description: Cancel a running GLM background job.
allowed-tools: ["Bash"]
argument-hint: "<job-id> [--json]"
---

You are running the `/glm:cancel` command.

The user must provide a job id. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" cancel <job-id>
```

The companion sends `SIGTERM` to the job's process (if still running) and marks the job's status as `cancelled`. It is idempotent — cancelling an already-cancelled or already-completed job updates the record's status but does no kill.

If the user passed `--json`, pass it through. If the job id is unknown, surface the companion's error message.
