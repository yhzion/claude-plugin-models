---
name: minimax-m3-prompting
description: Use when assembling a prompt to send to the self-hosted MiniMax-M3 model — either as the body of a `minimax-m3-companion task` call. Covers MiniMax-M3's response biases, recipes for common task shapes, and antipatterns that consistently degrade output quality.
---

# minimax-m3-prompting

This skill is for *assembling* the prompt body. The transport (how the prompt reaches MiniMax-M3) is covered by `[[minimax-m3-cli-runtime]]`; interpreting what comes back is `[[minimax-m3-result-handling]]`.

## What's different about MiniMax-M3

MiniMax-M3 is reached via the bunker-llm proxy (Anthropic-compatible surface), but the model behind the proxy has its own prompt-shape preferences. In practice:

1. **Long-form structured prompts work better than terse questions.** MiniMax-M3 produces higher-quality output when given an explicit persona, an explicit output template, and an explicit verification step. Treat every dispatch as if you were briefing a careful engineer who hasn't seen the project before.
2. **Markdown output is reliable; JSON mode is flaky.** Tell MiniMax-M3 "return as markdown with `## A`, `## B`" and it follows reliably. Don't rely on JSON-mode coercion — the markdown contract works better and is easier for the parent Claude Code session to surface to the user.
3. **Korean and English mix cleanly.** Unlike some hosted models, MiniMax-M3 does not drift when the prompt mixes Korean narrative with English code/log/path content. Lean into whichever language the user is using; do not force a translation pass.
4. **Short prompts get short answers.** If you want depth, *ask* for it ("Be thorough — at least three angles per issue.").
5. **Code-block precision matters.** Quote file paths, line numbers, and function signatures in fenced code blocks. Vague references like "the auth code" get vague responses.

## The three-section template (always start here)

```
## Background
[Why this task exists, prior conversation summary if relevant.
MiniMax-M3 has NO conversation memory — every prompt is fresh.]

## Request
[Exactly what you want MiniMax-M3 to do. One paragraph.]

## Context
[Embedded files, diffs, logs. Quote precisely, not entire files.
Use fenced code blocks with language tags.]
```

Every dispatched prompt should fit this skeleton. Even a tiny "rename this variable" request benefits — `## Request` forces you to state the goal cleanly.

## Recipes (composed prompts for common task shapes)

The recipes below mirror `glm-prompt-recipes.md` but with MiniMax-M3-specific framing.

### Code review

```
## Background
<one paragraph: what the change is and why it exists>

## Request
Review the diff below for correctness, security, performance, and style issues.
List every finding with `### <severity>: <title>` headers and a `**File:** path:line`
line. End with `## Looks good` even if empty.

## Context
<git diff or quoted hunks>
```

### Targeted refactor

```
## Background
<why this refactor is needed>

## Request
Refactor <specific function or module> to <goal>. Preserve existing behaviour
unless the change requires a behaviour shift — call out any behaviour shifts
explicitly.

## Context
<quoted file or function>
```

### Bug diagnosis

```
## Background
<symptom, repro steps, expected vs actual>

## Request
Diagnose the likely root cause and propose the smallest fix that resolves it.
If you can think of more than one plausible cause, list each as a hypothesis
with the experiment that would confirm/refute it.

## Context
<logs, stack trace, minimal repro>
```

### Documentation pass

```
## Background
<what the code does and who reads the doc>

## Request
Write a docstring (or README section) for <target> that covers: purpose,
public API, non-obvious invariants, and one example use. Match the surrounding
doc style if any.

## Context
<quoted code>
```

## Antipatterns (don't do these)

The top offenders, summarized:

- **Vague verbs** ("review this") → no structure, no coverage.
- **Mixed-purpose prompts** ("fix this and also explain why") → MiniMax-M3 picks one, usually the easier one.
- **No output format** → wall-of-text response that's hard to consume.
- **Buried instructions** (the actual ask is in line 47) → MiniMax-M3 follows the last clear directive it sees.
- **Asking MiniMax-M3 to "be honest about confidence"** without giving it a confidence scale → meaningless hedging.
- **Pointing at files by description rather than path** ("the auth module") → MiniMax-M3 cannot resolve what you meant. Quote the path.

## Quick reference

| Goal | Block |
|---|---|
| Want structured output | Add `## Output format` with a literal template |
| Want depth | Add "Be thorough — at least N angles" |
| Want refusal on precondition fail | Add `## Refuse if` block |
| Want MiniMax-M3 to verify before answering | Add `## Verify before answering` block |
| Want one of N alternatives | Add `## Constraints` with the rejection criteria |

## See also

- `[[minimax-m3-cli-runtime]]` — how the assembled prompt actually reaches MiniMax-M3.
- `[[minimax-m3-result-handling]]` — how to present what comes back.
