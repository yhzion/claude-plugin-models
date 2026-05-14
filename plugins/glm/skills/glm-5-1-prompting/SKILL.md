---
name: glm-5-1-prompting
description: Use when assembling a prompt to send to z.ai's GLM-5.1 model — either as the body of a `glm-companion task` call, or when extending review/specialty prompt templates. Covers the prompt block library, GLM-5.1's response biases, recipes for common task shapes (review, refactor, design), and antipatterns that consistently degrade output quality.
---

# glm-5-1-prompting

This skill is for *assembling* the prompt body. The transport (how the prompt reaches GLM) is covered by `[[glm-cli-runtime]]`; interpreting what comes back is `[[glm-result-handling]]`.

## What's different about GLM-5.1

GLM-5.1 is broadly compatible with Anthropic's prompt conventions (it speaks the Anthropic API over z.ai's endpoint), but in practice you'll get noticeably better output if you treat these as defaults:

1. **Explicit persona helps more than it does with Claude.** Lead with one sentence stating who GLM is for this task ("You are a senior backend engineer reviewing a migration.").
2. **Checklist-style instructions land cleanly.** Numbered steps and explicit "Do X / Don't do Y" pairs produce more consistent output than free-form guidance.
3. **Structured output via prompt > structured output via JSON mode.** Tell GLM "return as markdown with `## A`, `## B`" in the prompt and it follows reliably. Don't rely on JSON-mode coercion for v0.4.0 — the markdown contract works better.
4. **Short prompts get short answers.** If you want depth, *ask* for it ("Be thorough — at least three angles per issue.").
5. **Korean works well**, but mixing Korean prompts with English content (code, logs, file paths) is fine — GLM handles the mix without translation drift.

## The three-section template (always start here)

```
## Background
[Why this task exists, prior conversation summary if relevant.
GLM has NO conversation memory — every prompt is fresh.]

## Request
[Exactly what you want GLM to do. One paragraph.]

## Context
[Embedded files, diffs, logs. Quote precisely, not entire files.
Use fenced code blocks with language tags.]
```

Every dispatched prompt should fit this skeleton. Even a tiny "rename this variable" request benefits — `## Request` forces you to state the goal cleanly.

## Prompt block library

For common pieces you'll glue together, see `references/prompt-blocks.md`. Examples:

- Persona blocks (`## You are`)
- Output schema blocks (`## Output format`)
- Verification blocks (`## Verify before answering`)
- Refusal-handling blocks (when you *want* GLM to refuse if a precondition isn't met)

## Recipes (composed prompts for common task shapes)

See `references/glm-prompt-recipes.md`. Covers:

- Code review (full diff → structured findings)
- Targeted refactor (file + intent → revised file)
- Design exploration (requirements → 2-3 alternatives + tradeoffs)
- Bug diagnosis (symptom + repro → likely causes + experiments)
- Documentation pass (code → docstring/README section)

## Antipatterns (don't do these)

See `references/glm-prompt-antipatterns.md`. The top offenders, summarized:

- **Vague verbs** ("review this") → no structure, no coverage.
- **Mixed-purpose prompts** ("fix this and also explain why") → GLM picks one, usually the easier one.
- **No output format** → wall-of-text response that's hard to consume.
- **Buried instructions** (the actual ask is in line 47) → GLM follows the last clear directive it sees.
- **Asking GLM to "be honest about confidence"** without giving it a confidence scale → meaningless hedging.

## Quick reference

| Goal | Block |
|---|---|
| Want structured output | Add `## Output format` with a literal template |
| Want depth | Add "Be thorough — at least N angles" |
| Want refusal on precondition fail | Add `## Refuse if` block |
| Want GLM to verify before answering | Add `## Verify before answering` block |
| Want one of N alternatives | Add `## Constraints` with the rejection criteria |

## See also

- `[[glm-cli-runtime]]` — how the assembled prompt actually reaches GLM.
- `[[glm-result-handling]]` — how to present what comes back.
- `references/prompt-blocks.md`, `references/glm-prompt-recipes.md`, `references/glm-prompt-antipatterns.md` for the long-form library.
