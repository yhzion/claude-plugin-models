---
name: minimax-m3-result-handling
description: Use when presenting output that came back from `minimax-m3-companion` (any subcommand) to the user. Covers how to display MiniMax-M3 responses, what to do with truncated / empty / errored output, and the canonical formatting that keeps MiniMax-M3's content visually separate from the wrapping agent's own commentary.
---

# minimax-m3-result-handling

This skill governs how a Claude Code agent presents MiniMax-M3 output. The goal: the user should never wonder whether they're reading MiniMax-M3 or Claude.

## The canonical header

Wrap every MiniMax-M3 response under a clearly attributed header so the boundary is unambiguous:

```
## MiniMax-M3 Response (job <id>)
[verbatim stdout from the companion]
```

For status / result / cancel:

```
[verbatim companion output — these are CLI tool outputs, not MiniMax-M3 content, so no `## MiniMax-M3 Response` wrapper]
```

## Verbatim, not paraphrased

Do **not** rewrite MiniMax-M3's prose into your own words. Reasons:
- The user is paying for MiniMax-M3's output. Hiding it behind your interpretation defeats the point.
- Paraphrasing risks introducing errors or losing severity signals (e.g., "critical" → "might want to check").
- Comparison value: with verbatim output, the user can decide whether to trust MiniMax-M3 on this kind of task next time.

You may add a one-sentence framing *before* the wrapper ("Asked MiniMax-M3 to review the auth change — here's what it found:") and a one-sentence follow-up *after* the wrapper if action is needed ("Want me to apply the suggested fix to `auth.js:14`?").

## When the response looks off

| Symptom | What to do |
|---|---|
| Empty stdout, exit 0 | Fetch the log via `result <id>` to verify. If still empty, MiniMax-M3 likely produced only whitespace — surface this fact and offer to retry with a clearer prompt. |
| Truncated mid-sentence | The prompt likely hit a token cap. Tell the user, then suggest splitting the request (e.g., review one file at a time). |
| Refusal ("I can't help with that") | Forward verbatim. Do not retry with a softer prompt — MiniMax-M3's refusals are signal. |
| Off-topic | Forward verbatim with a one-line note: "MiniMax-M3 answered about X instead of Y — likely my prompt was ambiguous. Want me to rerun with a tighter prompt?" |
| Non-zero exit, no JSON | Read stderr and surface verbatim. Don't guess the cause. |
| 401 / 403 | The bunker key is missing/expired. Surface stderr verbatim and tell the user to check `~/.bunker/key.env`. |

## For background jobs

When you ran `task --background`, you returned a job id to the user. Later, when they (or you) check on it:

1. Run `status <id> --json` to get the current state.
2. If `status` is `running` and `--json` shows a sensible `updatedAt`, report progress: "Still working (started at X, last update Y)."
3. If `status` is `completed`, run `result <id> --json` and present the output under the canonical header.
4. If `status` is `failed`, present `errorMessage` and offer to retry.
5. If `status` is `cancelled`, just confirm: "Job was cancelled. Nothing to show."

## See also

- `[[minimax-m3-cli-runtime]]` — the actual contract for calling the companion.
- `[[minimax-m3-prompting]]` — when the response is bad, this is usually where the fix is.
