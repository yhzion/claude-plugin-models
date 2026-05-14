---
name: glm-result-handling
description: Use when presenting output that came back from `glm-companion` (any subcommand) to the user. Covers how to display GLM responses, what to do with truncated / empty / errored output, and the canonical formatting that keeps GLM's content visually separate from the wrapping agent's own commentary.
---

# glm-result-handling

This skill governs how a Claude Code agent presents GLM output. The goal: the user should never wonder whether they're reading GLM or Claude.

## The canonical header

Wrap every GLM response under a clearly attributed header so the boundary is unambiguous:

```
## GLM Response (job <id>)
[verbatim stdout from the companion]
```

For reviews:

```
## GLM Review (job <id>, scope=<scope>, base=<base>)
[verbatim stdout — markdown structured by prompts/review.md]
```

For status / result / cancel:

```
[verbatim companion output — these are CLI tool outputs, not GLM content, so no `## GLM Response` wrapper]
```

## Verbatim, not paraphrased

Do **not** rewrite GLM's prose into your own words. Reasons:
- The user is paying for GLM's output. Hiding it behind your interpretation defeats the point.
- Paraphrasing risks introducing errors or losing severity signals (e.g., "critical" → "might want to check").
- Comparison value: with verbatim output, the user can decide whether to trust GLM on this kind of task next time.

You may add a one-sentence framing *before* the wrapper ("Asked GLM to review the auth change — here's what it found:") and a one-sentence follow-up *after* the wrapper if action is needed ("Want me to apply the suggested fix to `auth.js:14`?").

## When the response looks off

| Symptom | What to do |
|---|---|
| Empty stdout, exit 0 | Fetch the log via `result <id>` to verify. If still empty, GLM likely produced only whitespace — surface this fact and offer to retry with a clearer prompt. |
| Truncated mid-sentence | The prompt likely hit a token cap. Tell the user, then suggest splitting the request (e.g., review one file at a time). |
| Refusal ("I can't help with that") | Forward verbatim. Do not retry with a softer prompt — GLM's refusals are signal. |
| Off-topic | Forward verbatim with a one-line note: "GLM answered about X instead of Y — likely my prompt was ambiguous. Want me to rerun with a tighter prompt?" |
| Non-zero exit, no JSON | Read stderr and surface verbatim. Don't guess the cause. |

## For background jobs

When you ran `task --background` or `review --background`, you returned a job id to the user. Later, when they (or you) check on it:

1. Run `status <id> --json` to get the current state.
2. If `status` is `running` and `--json` shows a sensible `updatedAt`, report progress: "Still working (started at X, last update Y)."
3. If `status` is `completed`, run `result <id> --json` and present the output under the canonical header.
4. If `status` is `failed`, present `errorMessage` and offer to retry.
5. If `status` is `cancelled`, just confirm: "Job was cancelled. Nothing to show."

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
- **Critical/major issues** deserve a one-line summary count at the top of your framing: "GLM flagged 1 critical and 2 major issues."
- If GLM produced an "Issues" section but no severity tags, just forward it — don't try to normalize.

## See also

- `[[glm-cli-runtime]]` — the actual contract for calling the companion.
- `[[glm-5-1-prompting]]` — when the response is bad, this is usually where the fix is.
