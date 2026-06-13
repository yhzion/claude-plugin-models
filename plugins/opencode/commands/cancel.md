---
description: Cancel a running opencode background job.
allowed-tools: ["Bash"]
argument-hint: "<job-id> [--json]"
---

You are running the `/opencode:cancel` command.

The user must provide a job id. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-companion.mjs" cancel <job-id>
```

The companion targets the job's process group and escalates `SIGTERM` → `SIGKILL` (opencode spins up its own server/children, so a plain kill is not enough), then marks the job's status as `cancelled`. It is idempotent — cancelling an already-cancelled or already-completed job updates the record's status but does no kill.

If the user passed `--json`, pass it through. If the job id is unknown, surface the companion's error message.
