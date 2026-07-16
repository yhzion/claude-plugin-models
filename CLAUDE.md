# CLAUDE.md — claude-plugin-models

## Project

Claude Code marketplace for plugins that bring external AI models into Claude Code. First plugin: `glm` (delegates tasks to z.ai GLM; model id comes from ~/.claude/settings.glm.json).

- **Plugin type:** Local/GitHub marketplace (multi-plugin, one per external model)
- **Current plugins:** glm (z.ai GLM — model id from ~/.claude/settings.glm.json), gemini (Google Gemini CLI), opencode (default/last-used model), pi (pi coding agent), minimax-m3 (self-hosted via bunker-llm).
- **Reference plugin:** `~/.claude/plugins/cache/openai-codex/codex/1.0.4/`
- **Repo / marketplace:** `yhzion/claude-plugin-models` (public); marketplace name `claude-plugin-models`
- **Target install:** `claude plugins marketplace add yhzion/claude-plugin-models` then `claude plugins install <id>@claude-plugin-models`
- **Layout:** marketplace at repo root, plugins at `plugins/<id>/` (codex pattern). Plugin id is the user-facing surface (`/<id>:*`, `<id>` agent).

## Architecture

GLM and minimax-m3 have no standalone CLI — both call Anthropic-compatible endpoints via the bundled `claude` binary:

```bash
claude --settings ~/.claude/settings.<id>.json -p "prompt"
```

- `glm`: `~/.claude/settings.glm.json` (z.ai GLM endpoint)
- `minimax-m3`: `~/.claude/settings.minimax-m3.json` (bunker-llm endpoint, model=minimax-m3)

Gemini uses its own CLI (`gemini -p`). minimax-m3 uses the same bundled `claude` binary pattern as glm, with `--settings ~/.claude/settings.minimax-m3.json` to point at the bunker-llm endpoint.

## Design Doc

See `docs/DESIGN.md` for full specification.

## Key Files

- `.claude-plugin/marketplace.json` — Marketplace manifest (lists plugins)
- `plugins/<id>/.claude-plugin/plugin.json` — Plugin manifest
- `plugins/<id>/agents/<id>.md` — Simple delegate agent (MVP)
- `plugins/<id>/agents/<id>-rescue.md` — Rescue-style delegation (Phase 2+)
- `plugins/<id>/scripts/<id>-companion.mjs` — Core CLI runtime (Phase 2+)
- `tests/*.test.mjs` — node --test smoke tests

## Reference

- Existing GLM config: `~/.claude/settings.glm.json`
- Existing GLM wrapper: `~/bin/claude-glm`
- Existing minimax-m3 wrapper: `~/.local/bin/claude-minimax-m3` (bunker-llm-backed; companion derives from this)
- Existing agent: `~/.claude/plugins/local/ai-delegates/agents/glm.md`
- Codex plugin source: `~/.claude/plugins/cache/openai-codex/codex/1.0.4/`

## Conventions

- All paths use `${CLAUDE_PLUGIN_ROOT}` (never hardcoded)
- Job files in `~/.claude/<id>-jobs/<workspace-hash>/`
- API key stored in `~/.claude/settings.<id>.json` (never in repo)
- minimax-m3 auth key additionally sourced from `~/.bunker/key.env` if BUNKER_KEY env not set (matches `claude-minimax-m3` wrapper behavior)
