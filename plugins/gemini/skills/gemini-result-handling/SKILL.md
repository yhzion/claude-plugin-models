---
name: gemini-result-handling
description: Use when presenting output that came back from `gemini-companion` (any subcommand) to the user. Covers how to display Gemini responses, how to handle stderr noise from the gemini CLI, what to do with truncated / empty / errored output, and the canonical formatting that keeps Gemini's content visually separate from the wrapping agent's own commentary.
---

# gemini-result-handling

This skill governs how a Claude Code agent presents Gemini output. The goal: the user should never wonder whether they're reading Gemini or Claude.

## The canonical header

Wrap every Gemini response under a clearly attributed header so the boundary is unambiguous:

```
## Gemini Response (job <id>)
[verbatim stdout from the companion]
```

For reviews:

```
## Gemini Review (job <id>, scope=<scope>, base=<base>)
[verbatim stdout — markdown structured by prompts/review.md]
```

For `status` / `result` / `cancel`:

```
[verbatim companion output — these are CLI tool outputs, not Gemini content, so no `## Gemini Response` wrapper]
```

## Verbatim, not paraphrased

Do **not** rewrite Gemini's prose into your own words. Reasons:
- The user is paying for Gemini's output. Hiding it behind your interpretation defeats the point.
- Paraphrasing risks introducing errors or losing severity signals (e.g., "critical" → "might want to check").
- Comparison value: with verbatim output, the user can decide whether to trust Gemini on this kind of task next time.

You may add a one-sentence framing *before* the wrapper ("Asked Gemini to review the migration — here's what it found:") and a one-sentence follow-up *after* the wrapper if action is needed ("Want me to apply the suggested fix to `migration.sql:14`?").

## Stderr noise — strip it from the wrapper

The gemini CLI writes incidental warnings to stderr that are not part of the model response:

```
Failed to use Ripgrep tool: ...
Terminal does not support true color rendering.
```

These appear in the companion's `error` field when the call still exited 0. They are **not** Gemini content — do not include them in `## Gemini Response`. If the call succeeded, surface only stdout. Only forward stderr verbatim when the call **failed** (non-zero exit).

## When the response looks off

| Symptom | What to do |
|---|---|
| Empty stdout, exit 0 | Fetch the log via `result <id>` to verify. If still empty, gemini likely produced only whitespace — surface this fact and offer to retry with a clearer prompt or a different model. |
| Truncated mid-sentence | The prompt likely hit a token cap. Tell the user, then suggest splitting the request (e.g., review one file at a time). Gemini's context is large, but per-response output limits still apply. |
| Refusal ("I can't help with that") | Forward verbatim. Do not retry with a softer prompt — Gemini's refusals are signal. |
| Off-topic | Forward verbatim with a one-line note: "Gemini answered about X instead of Y — likely my prompt was ambiguous. Want me to rerun with a tighter prompt?" |
| Exit 41 / `unauthenticated` | Stop. Surface the hint: tell the user to run `/gemini:setup` and complete OAuth or export `GEMINI_API_KEY`. |
| Non-zero exit, no JSON | Read stderr and surface verbatim. Don't guess the cause. |

## For background jobs

When you ran `task --background` or `review --background`, you returned a job id to the user. Later, when they (or you) check on it:

1. Run `status <id> --json` to get the current state.
2. If `status` is `running` and `--json` shows a sensible `updatedAt`, report progress: "Still working (started at X, last update Y)."
3. If `status` is `completed`, run `result <id> --json` and present the output under the canonical header.
4. If `status` is `failed`, present `errorMessage` and offer to retry. If `errorMessage` is `unauthenticated`, route to `/gemini:setup`.
5. If `status` is `cancelled`, just confirm: "Job was cancelled. Nothing to show."

## When `--output-format json` is in play

If a caller invoked the gemini CLI with `--output-format json` (advanced use; not the default for `task`/`review`), the stdout JSON also contains `stats.models.<model>.tokens` with `input`/`output`/`thoughts`/`cached` counts. If the user has asked about cost or token usage, surface those numbers — otherwise treat them as bookkeeping and present only the response text.

## Structured review output

Reviews come back as markdown with the structure defined in `prompts/review.md`:

```
## Intent
<one sentence>

## Issues

### <severity>: <title>
**File:** path:line
**Why it matters:** ...
**Suggested fix:** ...

## Looks good
- ...
```

When presenting reviews:

- Preserve the entire structure. Don't drop `## Looks good` even if it's empty — its absence/presence is signal.
- **Critical/major issues** deserve a one-line summary count at the top of your framing: "Gemini flagged 1 critical and 2 major issues."
- If Gemini produced an "Issues" section but no severity tags, just forward it — don't try to normalize.

## See also

- `[[gemini-cli-runtime]]` — the actual contract for calling the companion.
- `[[gemini-prompting]]` — when the response is bad, this is usually where the fix is.
