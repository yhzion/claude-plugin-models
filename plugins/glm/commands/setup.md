---
description: Check the GLM (z.ai) settings file and report readiness.
allowed-tools: ["Bash", "Read", "Write", "AskUserQuestion"]
argument-hint: "[--json]"
---

You are running the `/glm:setup` command. Your job is to verify that `~/.claude/settings.glm.json` exists, is valid, and contains the z.ai credentials needed for the GLM plugin.

## Step 1: Probe the current state

Run the companion's `setup` subcommand in JSON mode so you can branch on its output:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" setup --json
```

Parse the JSON:

- `{ "ok": true, ... }` — settings file is present and valid. Report it to the user as: *"GLM plugin ready. settings: <path>, model=<model>, baseUrl=<baseUrl>"*. Then stop.
- `{ "ok": false, "error": "..." }` — proceed to step 2.

## Step 2: Help the user create / fix the settings file

If `error` indicates the file is missing:

1. Tell the user what's needed: a z.ai coding-plan API token (`ANTHROPIC_AUTH_TOKEN`).
2. Use the `AskUserQuestion` tool to ask for the token. Mark the field as sensitive in the question prompt.
3. Write `~/.claude/settings.glm.json` with this exact content (substituting the token):

   ```json
   {
     "model": "glm-5.1",
     "env": {
       "ANTHROPIC_AUTH_TOKEN": "<token from user>",
       "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
       "API_TIMEOUT_MS": "3000000"
     },
     "permissions": { "defaultMode": "auto" }
   }
   ```

4. Re-run the probe in step 1 to confirm. Report the result.

If `error` indicates the file is invalid JSON or is missing a specific field, point out the issue and ask whether to recreate the file or guide the user to edit it manually. Do not silently overwrite an existing settings file.

## Notes

- The settings file lives at `~/.claude/settings.glm.json` (or wherever `GLM_SETTINGS_PATH` env var points). Never commit it to the repo.
- If the user passes `--json` to the slash command, pass it through to the companion and emit the JSON verbatim.
