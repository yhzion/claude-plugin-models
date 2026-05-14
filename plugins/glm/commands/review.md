---
description: Run a GLM-powered code review on the current branch or working tree.
allowed-tools: ["Bash"]
argument-hint: "[--base <ref>] [--scope auto|working-tree|branch] [--background] [--json]"
---

You are running the `/glm:review` command.

Pass the user's flags through to the companion's `review` subcommand:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" review [<flags>]
```

## Behavior

- `--scope auto` (default): if the working tree has uncommitted changes, review those; otherwise diff the current branch against the detected main branch.
- `--scope working-tree`: force the dirty working tree as the review target.
- `--scope branch`: force a `<base>...HEAD` diff. Requires a detectable `main` or `master` branch, or use `--base <ref>` to override.
- `--base <ref>`: explicit base ref (commit, tag, or branch).
- `--background`: queue as a job and return immediately. Use `/glm:status` and `/glm:result <id>` to follow up.
- `--json`: emit a JSON envelope.

## Output

Foreground — GLM's review is written to stdout in markdown following the structure in `prompts/review.md` (`## Intent`, `## Issues`, `## Looks good`). Surface it to the user verbatim under:

```
## GLM Review (job <id>, scope=<scope>, base=<base>)
[verbatim output]
```

Background — show the job id and the follow-up commands.

## Failure modes

- **`Not a git repository`** → the user must run this from inside a repo.
- **`Nothing to review`** → working tree is clean and no extra branch commits exist relative to main. Suggest the user make a change or pass `--base`.
- **`Settings file does not exist`** → tell the user to run `/glm:setup` first.
