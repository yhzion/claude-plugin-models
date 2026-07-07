---
description: Check the MiniMax-M3 settings file and verify the bunker-llm proxy is reachable.
allowed-tools: ["Bash", "Read", "Write", "AskUserQuestion"]
argument-hint: "[--json]"
---

You are running the `/minimax-m3:setup` command. Your job is to verify that `~/.claude/settings.minimax-m3.json` exists, is valid, and points at the bunker-llm proxy used to reach the self-hosted MiniMax-M3 model.

## Authentication model

MiniMax-M3 does **not** store the API key in the settings file. The key lives in `~/.bunker/key.env` (chmod 600) and is sourced by the user's wrapper before invoking `claude` — the same pattern as the existing `~/bin/claude-minimax-m3` script. The settings file only carries routing/URL config.

If `~/.bunker/key.env` does not exist or is unreadable, **stop and tell the user** — do not try to fabricate a key.

## Step 1: Probe the current state

Run the companion's `setup` subcommand in JSON mode:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/minimax-m3-companion.mjs" setup --json
```

Parse the JSON:

- `{ "ok": true, ... }` — settings file is present and valid. Report: *"MiniMax-M3 plugin ready. settings: <path>, model=<model>, baseUrl=<baseUrl>"*. Then check that `~/.bunker/key.env` exists and is mode 600 — warn (but do not fail) if it is missing or has loose permissions.
- `{ "ok": false, "error": "..." }` — proceed to step 2.

## Step 2: Help the user create / fix the settings file

If the file is missing:

1. Tell the user what's needed: the bunker-llm base URL (`ANTHROPIC_BASE_URL`) and the `minimax-m3` model routing. The key itself stays outside this file.
2. Write `~/.claude/settings.minimax-m3.json` with this content:

   ```json
   {
     "model": "minimax-m3",
     "env": {
       "ANTHROPIC_BASE_URL": "https://llm-proxy.datamaker.io",
       "API_TIMEOUT_MS": "3000000",
       "ANTHROPIC_DEFAULT_OPUS_MODEL": "minimax-m3",
       "ANTHROPIC_DEFAULT_SONNET_MODEL": "minimax-m3",
       "ANTHROPIC_DEFAULT_HAIKU_MODEL": "minimax-m3",
       "CLAUDE_CODE_SUBAGENT_MODEL": "minimax-m3"
     },
     "permissions": { "defaultMode": "auto" }
   }
   ```

3. Re-run the probe to confirm.

If `error` indicates the file is invalid JSON or is missing `env.ANTHROPIC_BASE_URL`, point out the issue and ask whether to recreate the file or guide the user to edit it manually. Do not silently overwrite an existing settings file.

## Notes

- The settings file lives at `~/.claude/settings.minimax-m3.json` (or wherever `MINIMAX_M3_SETTINGS_PATH` env var points). Never commit it to the repo.
- The key file lives at `~/.bunker/key.env` and must NOT be edited by this command. Permissions must be 600.
- If the user passes `--json`, pass it through to the companion and emit the JSON verbatim.
