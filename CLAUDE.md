# CLAUDE.md — claude-plugin-glm

## Project

Claude Code plugin that delegates tasks to z.ai's GLM-5.1 model.

- **Plugin type:** Local/GitHub marketplace
- **Model:** GLM-5.1 via z.ai Anthropic-compatible API
- **Reference plugin:** `~/.claude/plugins/cache/openai-codex/codex/1.0.4/`
- **Target install:** `claude plugins marketplace add datamaker-kr/claude-plugin-glm`

## Architecture

GLM has no standalone CLI. Tasks execute via:
```bash
claude --settings ~/.claude/settings.glm.json -p "prompt"
```

## Design Doc

See `docs/DESIGN.md` for full specification.

## Key Files

- `scripts/glm-companion.mjs` — Core CLI runtime
- `scripts/lib/claude-runner.mjs` — `claude -p` subprocess management
- `agents/glm-rescue.md` — Delegation subagent
- `.claude-plugin/plugin.json` — Plugin manifest

## Reference

- Existing GLM config: `~/.claude/settings.glm.json`
- Existing GLM wrapper: `~/bin/claude-glm`
- Existing agent: `~/.claude/plugins/local/ai-delegates/agents/glm.md`
- Codex plugin source: `~/.claude/plugins/cache/openai-codex/codex/1.0.4/`

## Conventions

- All paths use `${CLAUDE_PLUGIN_ROOT}` (never hardcoded)
- Job files in `~/.claude/glm-jobs/<workspace-hash>/`
- API key stored in `~/.claude/settings.glm.json` (never in repo)
