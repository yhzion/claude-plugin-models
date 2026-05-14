---
description: Verify gemini CLI is installed and authenticated.
allowed-tools: ["Bash"]
argument-hint: "[--json] [--skip-probe]"
---

You are running the `/gemini:setup` command. Your job is to verify that the `gemini` CLI is installed and that the user is authenticated.

## Probe

Run the companion's `setup` subcommand in JSON mode:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" setup --json
```

Parse the JSON:

- `{ "ok": true, "version": "...", "probed": true }` — gemini CLI present and authenticated. Report: *"Gemini ready — CLI v<version>, auth OK."* Stop.
- `{ "ok": false, "error": "gemini CLI not found..." }` — tell the user to install the gemini CLI: `npm install -g @google/gemini-cli` (or equivalent — point them to https://github.com/google-gemini/gemini-cli).
- `{ "ok": false, "reason": "unauthenticated", "error": "...", "hint": "..." }` — the CLI is installed but no auth method is configured. Surface the hint verbatim. Common fixes:
  - Open a terminal and run `gemini` once — it will walk through OAuth login interactively. After completing OAuth, re-run `/gemini:setup`.
  - Or export `GEMINI_API_KEY=<key>` in the user's shell profile.
  - For Vertex AI: set `GOOGLE_GENAI_USE_VERTEXAI=true` with appropriate gcloud credentials.
- `{ "ok": false, "reason": "probe-failed", ... }` — gemini CLI is installed and auth seems configured but a probe call failed. Surface the error verbatim — could be a network issue or expired token.

## Notes

- Unlike GLM, this plugin does NOT manage a settings file. The gemini CLI handles its own auth state under `~/.gemini/`. Do not try to write credentials yourself.
- If the user passes `--skip-probe`, pass it through — that just verifies the binary exists without making an API call.
- If the user passes `--json`, emit the JSON verbatim.
