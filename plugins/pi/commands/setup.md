---
description: Check that the pi CLI is installed and a default model is reachable.
allowed-tools: ["Bash"]
argument-hint: "[--skip-probe] [--json]"
---

You are running the `/pi:setup` command. Your job is to verify that the `pi` coding agent CLI is installed and that delegation through its default (configured) model works. Like the opencode plugin, pi manages its own provider/model and credentials — there is **no settings file to create**.

## Step 1: Probe

Run the companion's `setup` subcommand in JSON mode:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pi-companion.mjs" setup --json
```

By default this does a real (cheap) round-trip on pi's default model to confirm a model and credentials are configured. If you only want to confirm the binary is present without spending a model call, add `--skip-probe`.

## Step 2: Interpret

Parse the JSON:

- `{ "ok": true, "version": "...", "probed": true }` — pi is ready. Report: *"pi ready — CLI v<version>, default model reachable."* Then stop.
- `{ "ok": true, "version": "...", "probed": false }` — binary present, probe skipped. Report that and note the model wasn't verified.
- `{ "ok": false, "error": "..." }` — surface the error and the `hint`:
  - If the CLI is missing → tell the user to install pi from https://pi.dev.
  - If the probe failed (no model/credentials) → tell the user to set a provider API key (e.g. `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or run `pi` once in a terminal to configure a model.

If the user passed `--json` to the slash command, pass it through to the companion and emit the JSON verbatim.
