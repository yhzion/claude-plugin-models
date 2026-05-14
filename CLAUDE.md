# CLAUDE.md — claude-plugin-models

## Project

Claude Code marketplace for plugins that bring external AI models into Claude Code. First plugin: `glm` (delegates tasks to z.ai's GLM-5.1).

- **Plugin type:** Local/GitHub marketplace (multi-plugin, one per external model)
- **Current plugins:** `glm` (z.ai GLM-5.1 via Anthropic-compatible API)
- **Reference plugin:** `~/.claude/plugins/cache/openai-codex/codex/1.0.4/`
- **Repo / marketplace:** `yhzion/claude-plugin-models` (public); marketplace name `claude-plugin-models`
- **Target install:** `claude plugins marketplace add yhzion/claude-plugin-models` then `claude plugins install glm@claude-plugin-models`
- **Layout:** marketplace at repo root, plugins at `plugins/<id>/` (codex pattern). Plugin id `glm` is the user-facing surface (`/glm:*`, `glm` agent) and is preserved across the repo rename.

## Architecture

GLM has no standalone CLI. Tasks execute via:
```bash
claude --settings ~/.claude/settings.glm.json -p "prompt"
```

## Design Doc

See `docs/DESIGN.md` for full specification.

## Key Files

- `.claude-plugin/marketplace.json` — Marketplace manifest (lists plugins)
- `plugins/glm/.claude-plugin/plugin.json` — Plugin manifest
- `plugins/glm/agents/glm.md` — Simple GLM delegate agent (MVP)
- `plugins/glm/agents/glm-rescue.md` — Rescue-style delegation (Phase 2+)
- `plugins/glm/scripts/glm-companion.mjs` — Core CLI runtime (Phase 2+)
- `tests/*.test.mjs` — node --test smoke tests

## Reference

- Existing GLM config: `~/.claude/settings.glm.json`
- Existing GLM wrapper: `~/bin/claude-glm`
- Existing agent: `~/.claude/plugins/local/ai-delegates/agents/glm.md`
- Codex plugin source: `~/.claude/plugins/cache/openai-codex/codex/1.0.4/`

## Conventions

- All paths use `${CLAUDE_PLUGIN_ROOT}` (never hardcoded)
- Job files in `~/.claude/glm-jobs/<workspace-hash>/`
- API key stored in `~/.claude/settings.glm.json` (never in repo)
