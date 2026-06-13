---
description: Check that the opencode CLI is installed and a default model is reachable.
allowed-tools: ["Bash"]
argument-hint: "[--skip-probe] [--json]"
---

You are running the `/opencode:setup` command. Your job is to verify that the `opencode` CLI is installed and that delegation through its default (last-used) model works. Unlike the glm/gemini plugins, opencode manages its own auth and model — there is **no settings file to create**.

## Step 1: Probe

Run the companion's `setup` subcommand in JSON mode:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-companion.mjs" setup --json
```

By default this does a real (cheap) round-trip on opencode's default model to confirm a model and credentials are configured. If you only want to confirm the binary is present without spending a model call, add `--skip-probe`.

## Step 2: Interpret

Parse the JSON:

- `{ "ok": true, "version": "...", "probed": true }` — opencode is ready. Report: *"opencode ready — CLI v<version>, default model reachable."* Then stop.
- `{ "ok": true, "version": "...", "probed": false }` — binary present, probe skipped. Report that and note the model wasn't verified.
- `{ "ok": false, "error": "..." }` — surface the error and the `hint`:
  - If the CLI is missing → tell the user to install opencode from https://opencode.ai.
  - If the probe failed (no model/credentials) → tell the user to run `opencode` once in a terminal to pick a default model, or `opencode auth` to add provider credentials.

If the user passed `--json` to the slash command, pass it through to the companion and emit the JSON verbatim.
