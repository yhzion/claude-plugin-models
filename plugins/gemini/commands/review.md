---
description: Run a Gemini-powered code review on the current branch or working tree.
allowed-tools: ["Bash"]
argument-hint: "[--base <ref>] [--scope auto|working-tree|branch] [--model <name>] [--background] [--json]"
---

You are running the `/gemini:review` command.

Pass the user's flags through to the companion's `review` subcommand:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" review [<flags>]
```

## Behavior

- `--scope auto` (default): if the working tree has uncommitted changes, review those; otherwise diff the current branch against the detected main branch.
- `--scope working-tree`: force the dirty working tree as the review target.
- `--scope branch`: force a `<base>...HEAD` diff. Requires a detectable `main` or `master` branch, or use `--base <ref>` to override.
- `--base <ref>`: explicit base ref (commit, tag, or branch).
- `--model <name>`: override the default Gemini model (e.g., `gemini-2.5-flash` for cheaper/faster reviews).
- `--background`: queue as a job and return immediately. Use `/gemini:status` and `/gemini:result <id>` to follow up.
- `--json`: emit a JSON envelope.

## Output

Foreground — Gemini's review is written to stdout in markdown following the structure in `prompts/review.md` (`## Intent`, `## Issues`, `## Looks good`). Surface it to the user verbatim under:

```
## Gemini Review (job <id>, scope=<scope>, base=<base>)
[verbatim output]
```

Background — show the job id and the follow-up commands.

## Failure modes

- **`Not a git repository`** → the user must run this from inside a repo.
- **`Nothing to review`** → working tree is clean and no extra branch commits exist relative to main. Suggest the user make a change or pass `--base`.
- **`gemini CLI not found`** → tell the user to install the gemini CLI (see `/gemini:setup`).
- **exit code 41 / `unauthenticated`** → gemini CLI is installed but no auth method is configured. Tell the user to run `/gemini:setup` and follow its hint (`gemini` interactive OAuth, or `GEMINI_API_KEY`).
