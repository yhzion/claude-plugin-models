# GLM Plugin for Claude Code — Design Document

**Date:** 2026-05-14
**Status:** Draft
**Author:** 전영호

## Goal

Create a Claude Code plugin that mirrors the Codex plugin's UX but delegates tasks to z.ai's GLM-5.1 model via `claude -p` subprocess. Installable from a GitHub marketplace.

## Background

- User has z.ai coding plan with GLM-5.1 access
- `claude-glm` wrapper (`~/bin/claude-glm`) already works by overriding env vars
- Codex plugin (`openai/codex-plugin-cc`) provides the target UX pattern
- GLM has no standalone CLI — it uses Claude Code's infrastructure with env overrides

## Architecture

### Execution Model

```
Codex:  codex-companion → app-server → codex CLI → GPT
GLM:    glm-companion   → claude -p  → z.ai API → GLM-5.1
```

Core difference: GLM spawns `claude --settings settings.glm.json -p "prompt"` as a subprocess instead of calling a standalone CLI.

### Plugin Structure

```
claude-plugin-glm/
├── .claude-plugin/
│   └── plugin.json              # Manifest
├── agents/
│   └── glm-rescue.md            # Subagent for task delegation
├── commands/
│   ├── rescue.md                # /glm:rescue
│   ├── review.md                # /glm:review
│   ├── setup.md                 # /glm:setup (API key config)
│   ├── status.md                # /glm:status
│   ├── result.md                # /glm:result
│   └── cancel.md                # /glm:cancel
├── hooks/
│   └── hooks.json               # Session lifecycle hooks
├── scripts/
│   ├── glm-companion.mjs        # Core runtime (~300-400 lines)
│   └── lib/
│       ├── args.mjs             # Arg parsing (from Codex)
│       ├── claude-runner.mjs    # claude -p subprocess management
│       ├── fs.mjs               # File utilities
│       ├── git.mjs              # Git context collection (for review)
│       ├── job-control.mjs      # Job tracking
│       ├── process.mjs          # Process management
│       ├── render.mjs           # Output rendering
│       ├── state.mjs            # State file management
│       └── workspace.mjs        # Workspace root resolution
├── skills/
│   ├── glm-cli-runtime/
│   │   └── SKILL.md             # Runtime rules for rescue subagent
│   ├── glm-result-handling/
│   │   └── SKILL.md             # Result interpretation rules
│   └── glm-5-1-prompting/
│       ├── SKILL.md             # Prompt engineering for GLM-5.1
│       └── references/
│           ├── prompt-blocks.md
│           ├── glm-prompt-recipes.md
│           └── glm-prompt-antipatterns.md
├── prompts/
│   └── review.md                # Review prompt template
├── schemas/
│   └── review-output.schema.json
├── docs/
│   └── DESIGN.md                # This file
└── README.md
```

## Component Details

### 1. glm-companion.mjs (Core Runtime)

**Commands:**

| Command | Description |
|---------|-------------|
| `setup [--json]` | Check GLM config, test API connection |
| `task [prompt] [--background] [--write] [--resume-last\|--fresh]` | Delegate task to GLM |
| `review [--base <ref>] [--scope <auto\|working-tree\|branch>]` | Review code changes |
| `status [job-id] [--all] [--json]` | Check job status |
| `result [job-id] [--json]` | Get completed job result |
| `cancel [job-id] [--json]` | Cancel running job |
| `task-resume-candidate [--json]` | Find resumable task thread |

**Task execution flow:**

```
1. Receive prompt
2. Create job record (queued)
3. Spawn: claude --settings ~/.claude/settings.glm.json -p "prompt"
   - Foreground: stream stdout directly
   - Background: detached process, update job file
4. On completion: update job status (completed/failed)
5. Return output
```

**Settings file handling:**

- Default: `~/.claude/settings.glm.json`
- Custom: `GLM_SETTINGS_PATH` env var override
- The companion reads the settings file to extract API credentials for connection testing

### 2. Job Tracking System

**Storage location:** `~/.claude/glm-jobs/<workspace-hash>/`

**Job states:** `queued` → `running` → `completed` | `failed` | `cancelled`

**Job record schema:**
```json
{
  "id": "glm-task-abc123",
  "status": "running",
  "title": "GLM Task",
  "summary": "Diagnose auth bug",
  "jobClass": "task",
  "kind": "task",
  "prompt": "...",
  "pid": 12345,
  "write": true,
  "logFile": "/path/to/log",
  "sessionId": "claude-session-uuid",
  "createdAt": "2026-05-14T10:00:00Z",
  "updatedAt": "2026-05-14T10:00:30Z",
  "completedAt": null,
  "errorMessage": null
}
```

### 3. Setup & Authentication

**`/glm:setup` flow:**

1. Check if `~/.claude/settings.glm.json` exists
2. If not, prompt for API key via `AskUserQuestion`
3. Write settings file with:
   ```json
   {
     "model": "glm-5.1",
     "env": {
       "ANTHROPIC_AUTH_TOKEN": "<user-provided-key>",
       "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
       "API_TIMEOUT_MS": "3000000"
     },
     "permissions": { "defaultMode": "auto" }
   }
   ```
4. Test connection: `curl -s https://api.z.ai/api/anthropic/v1/models -H "x-api-key: <key>"`
5. Report status

**Security:** API key stored in `~/.claude/settings.glm.json` (not in plugin directory, not in git).

### 4. Review

**Flow:**
1. Collect git diff (working tree or branch comparison)
2. Build review prompt from template (`prompts/review.md`)
3. Execute as `task` with read-only mode
4. Parse and render structured output

### 5. Prompt Engineering (glm-5-1-prompting)

Adapts Codex's GPT-5.4 prompting patterns for GLM-5.1:

- Same XML tag structure (`<task>`, `<verification_loop>`, `<grounding_rules>`)
- GLM-specific adjustments:
  - No model alias mapping (single model: glm-5.1)
  - Prompt length considerations for GLM's context window
  - Response format expectations tuned to GLM's output style

### 6. Hooks

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs\" session-init",
        "timeout": 5
      }]
    }],
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs\" session-cleanup",
        "timeout": 5
      }]
    }]
  }
}
```

No stop-time review gate in v1 (can be added later).

## Marketplace Installation

**User flow:**
```bash
# Add marketplace
claude plugins marketplace add datamaker-kr/claude-plugin-glm

# Install
claude plugins install glm

# Configure API key
# In Claude Code session: /glm:setup
```

**For local development:**
```bash
# Symlink
ln -s ~/datamaker/claude-plugin-glm ~/.claude/plugins/local/glm
```

## What We're NOT Building (v1)

- Adversarial review (can add later)
- Stop-time review gate
- Model selection (GLM-5.1 only)
- Reasoning effort levels (not applicable to GLM)
- App-server protocol (uses claude -p directly)

## Implementation Phases

### Phase 1: Minimal working plugin
- plugin.json manifest
- glm-companion.mjs with `setup` and `task` commands
- claude-runner.mjs (subprocess management)
- args.mjs, fs.mjs, process.mjs (from Codex, adapted)
- setup.md, rescue.md commands
- glm-rescue.md agent
- glm-cli-runtime, glm-result-handling skills

### Phase 2: Job tracking
- state.mjs, job-control.mjs
- Background task execution
- status.md, result.md, cancel.md commands

### Phase 3: Review
- git.mjs (from Codex)
- review prompt template
- review.md command
- review-output.schema.json

### Phase 4: Prompt engineering & polish
- glm-5-1-prompting skill with references
- render.mjs refinements
- README.md
- Marketplace packaging

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| GLM invocation | `claude -p` subprocess | GLM has no CLI; this reuses Claude Code's tool infrastructure |
| Job storage | File-based in `~/.claude/glm-jobs/` | Mirrors Codex pattern; no DB dependency |
| Auth storage | `~/.claude/settings.glm.json` | Already established pattern; not in git |
| Background tasks | Detached `claude -p` process | Same pattern as Codex's task-worker |
| Portability | `${CLAUDE_PLUGIN_ROOT}` everywhere | Required for marketplace installation |
