---
name: gemini-prompting
description: Use when assembling a prompt to send to Google's Gemini model — either as the body of a `gemini-companion task` call, or when extending review/specialty prompt templates. Covers Gemini 3 Pro's response biases vs the faster 2.5 Flash, how to leverage Gemini's long context window, recipes for common task shapes, and antipatterns that consistently degrade output quality.
---

# gemini-prompting

This skill is for *assembling* the prompt body. The transport (how the prompt reaches Gemini) is covered by `[[gemini-cli-runtime]]`; interpreting what comes back is `[[gemini-result-handling]]`.

## What's different about Gemini

Gemini (default routing `auto-gemini-3` → `gemini-3.1-pro-preview`) has some practical biases that differ from both Claude and GLM:

1. **Very large context window.** Don't be afraid to paste whole files when context matters. Gemini handles repository-scale dumps better than most. The bottleneck is usually output length, not input length.
2. **Strong structural compliance.** When you specify `## Output format`, Gemini follows it almost mechanically. Use this to your advantage — define the exact shape you want.
3. **Verbose by default.** Gemini tends to over-explain. If you want a terse answer, *ask* for it ("Answer in under 100 words. No preamble.").
4. **Multilingual handles mixed input cleanly.** Korean prompts with English code/logs are fine — no translation drift.
5. **No conversation memory across CLI calls.** Every `task` invocation is a fresh prompt. State you need from prior turns must be embedded.
6. **Model selection matters more than with GLM.** `gemini-3.1-pro-preview` is slow and thorough; `gemini-2.5-flash` (pass via `--model gemini-2.5-flash`) is 5–10× faster and usually sufficient for code review, refactors, and short reasoning. Reserve pro-preview for tasks that genuinely need deep reasoning.

## The three-section template (always start here)

```
## Background
[Why this task exists, prior conversation summary if relevant.
Gemini has NO conversation memory across CLI calls — every prompt is fresh.]

## Request
[Exactly what you want Gemini to do. One paragraph.]

## Context
[Embedded files, diffs, logs. Quote precisely — but Gemini handles big
context well, so err toward including more rather than less when in doubt.
Use fenced code blocks with language tags.]
```

Every dispatched prompt should fit this skeleton. Even a tiny "rename this variable" request benefits — `## Request` forces you to state the goal cleanly.

## Picking a model

| Task | Suggested model |
|---|---|
| Code review of a small PR (< 500 lines diff) | `gemini-2.5-flash` (fast, cheap, good enough) |
| Code review of a large refactor | default (`gemini-3.1-pro-preview`) |
| Quick Q&A, doc lookup, syntax check | `gemini-2.5-flash` |
| Bug diagnosis with long logs | default — needs reasoning depth |
| Design exploration / architecture | default — needs reasoning depth |
| Documentation pass on a single file | `gemini-2.5-flash` |

Pass via the companion's `--model` flag: `task --model gemini-2.5-flash "..."`.

## Block library

For common pieces you'll glue together:

### Persona block

```
## You are
A senior <role> reviewing <artifact>. Your goal is to find <category> issues
and skip cosmetic nits.
```

Gemini responds well to explicit role-priming — more so than GLM, less so than Claude.

### Output format block

```
## Output format
Return your answer as markdown with this exact structure:

## <Section A>
<one sentence>

## <Section B>
- bullet
- bullet
```

Gemini follows literal templates reliably. This is the single highest-leverage block for predictable output.

### Verification block

```
## Verify before answering
Before responding, check:
1. Does my answer reference an actual function/file in the context?
2. If I cite a line number, did I look it up in the diff above?
3. Am I introducing a claim not supported by the input?

If any answer is "no", revise before responding.
```

Reduces hallucinated file/line references — a known Gemini failure mode on large diffs.

### Terse-mode block (Gemini-specific)

```
## Style
Be terse. No preamble. No "Sure, I can help with that." No closing summary.
Answer the question and stop.
```

Gemini's default verbosity is higher than Claude's — explicit terseness instruction is more often needed.

## Recipes (composed prompts for common task shapes)

### Code review

Use `prompts/review.md` as the template — it's already structured. Inject diff + commits via the placeholders.

### Targeted refactor

```
## You are
A senior <language> engineer refactoring code.

## Background
<why this refactor>

## Request
Rewrite the file below. Apply: <list of changes>. Preserve all behavior.
Return the full updated file in a single fenced code block — no commentary,
no explanation.

## Context
```<lang>
<full file contents>
```
```

The "single fenced code block, no commentary" constraint is critical — without it Gemini wraps the file in explanation.

### Bug diagnosis

```
## You are
A senior engineer triaging a bug report.

## Request
Given the symptom, the repro steps, and the relevant source, hypothesize:
1. Three most likely root causes, ranked by probability.
2. For each: the smallest experiment that would confirm or rule it out.

## Context
### Symptom
<description>

### Repro
<steps>

### Source (relevant excerpts only)
<code>

## Output format
## Hypotheses
### 1. <title> — <probability: high|medium|low>
**Why:** ...
**Confirming experiment:** ...
(repeat for 2 and 3)
```

### Design exploration

```
## You are
A senior architect exploring options.

## Request
Propose 2–3 distinct designs for <X>. For each: one paragraph describing the
approach, then a bullet list of tradeoffs. Do not pick a winner — present them
neutrally.

## Constraints
- <hard requirement 1>
- <hard requirement 2>

## Context
<existing system summary, relevant code excerpts>
```

## Antipatterns (don't do these)

- **Vague verbs.** "review this", "improve this" → no structure, no coverage. Always specify *what* to look for.
- **Mixed-purpose prompts.** "Fix this bug and also explain why" → Gemini picks one (usually the explanation). Send two separate prompts instead.
- **No output format.** Wall-of-text response. Always include `## Output format` for anything beyond a one-sentence answer.
- **Buried instructions.** The actual ask is in line 47 → Gemini follows the last clear directive it sees. Put `## Request` near the top.
- **"Be honest" without a scale.** "Be honest about confidence" → meaningless hedging. Give an explicit scale (`high|medium|low`).
- **Using pro-preview for trivial tasks.** Wasteful. `gemini-2.5-flash` handles 80% of dispatches at a fraction of the cost.

## Quick reference

| Goal | Block |
|---|---|
| Want structured output | Add `## Output format` with a literal template |
| Want terseness | Add `## Style` with explicit "no preamble" instruction |
| Want depth | Use default model (pro-preview), ask "Be thorough" |
| Want speed/cost savings | Pass `--model gemini-2.5-flash` |
| Want fewer hallucinated refs | Add `## Verify before answering` block |
| Want one of N alternatives | Add `## Constraints` with the rejection criteria |

## See also

- `[[gemini-cli-runtime]]` — how the assembled prompt actually reaches Gemini.
- `[[gemini-result-handling]]` — how to present what comes back.
- `prompts/review.md` for the canonical review template (lives at the plugin root).
