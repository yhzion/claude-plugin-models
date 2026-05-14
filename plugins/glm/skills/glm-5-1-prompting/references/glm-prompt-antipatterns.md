# GLM-5.1 prompt antipatterns

Things that consistently degrade output quality. Each entry: what it looks like, why it fails, and what to do instead.

## 1. Vague verbs

❌ Bad:
```
Review this code.
```

Why it fails: "Review" can mean security audit, refactor opportunities, style critique, performance, test coverage, or just "explain." GLM picks one (usually the most superficial — style) and gives a shallow answer.

✅ Good:
```
Review this code for:
1. Correctness — logic errors, off-by-one, wrong API usage.
2. Regression risk — behavior changes affecting non-visible callers.
3. Test coverage — branches changed but not tested.

Skip cosmetic nits unless they hide a real concern.
```

## 2. Mixed-purpose prompts

❌ Bad:
```
Fix this bug and also explain why it happened and rewrite the tests.
```

Why it fails: GLM does one of the three (usually the easiest — the explanation) and skips or fakes the others. The output ends up neither a fix you can apply nor a clear post-mortem.

✅ Good: split into separate `task` calls. Or, if you must combine:

```
Do these three tasks in order. Complete each fully before moving to the next.

1. Fix the bug — return the patched file in a fenced code block.
2. Explain the root cause — one paragraph, after the code block.
3. Update tests to cover the regression — return the patched test file in a second fenced code block.
```

Numbered sequencing + explicit output formatting helps but doesn't fully solve it. Splitting is more reliable.

## 3. No output format

❌ Bad:
```
Tell me what's wrong with this code.
```

Why it fails: GLM emits a wall of text with no structure. Hard to action, hard to summarize, hard to compare against the next run.

✅ Good: add a `## Output format` block (see `prompt-blocks.md`). At minimum:

```
## Output format

Return a bulleted list. One bullet per issue. Each bullet starts with `[severity]` (one of critical/major/minor), then a one-line description, then a sub-bullet with the suggested fix.
```

## 4. Buried instructions

❌ Bad:
```
{{long context}}
{{long context}}
{{long context}}
Oh and one more thing — also check for SQL injection.
```

Why it fails: GLM-5.1 tends to follow the *last clear directive* it saw, but if the actual ask is buried in line 47 of a 60-line prompt, it competes with whatever was at the top. The result is partial coverage.

✅ Good: put all instructions in the `## Request` section near the top. Context goes below in `## Context`. If you need to add a constraint mid-prompt, hoist it back up.

## 5. Asking for confidence without a scale

❌ Bad:
```
Be honest about your confidence level in each suggestion.
```

Why it fails: "Confidence" is fuzzy. GLM produces hedged phrases ("I think", "might be", "potentially") that don't actually let the reader filter by quality.

✅ Good: give a concrete scale.

```
For each suggestion, append a confidence tag:
- [high] — I am sure based on the code shown.
- [med] — Likely correct but depends on context not shown.
- [low] — Speculative, would need to check the actual runtime / data.
```

## 6. Asking GLM to "make assumptions explicit" without enforcement

❌ Bad:
```
Tell me your assumptions.
```

Why it fails: GLM forgets and embeds assumptions silently into the answer.

✅ Good:
```
## Verify before answering

Before you write the answer, list every assumption you're making about context that is NOT shown in this prompt. Put them in a `## Assumptions` section at the top of your response. If an assumption is load-bearing for your conclusion, explicitly mark it `(load-bearing)`.
```

## 7. Embedding entire files when you need a hunk

❌ Bad:
```
## Context

```typescript
{{800 lines of file}}
```

Now please review the validate() function on line 612.
```

Why it fails: Token cost balloons, GLM's attention disperses across irrelevant code, output is less focused on the target function.

✅ Good:
```
## Context

File: src/auth.ts (function validate at line 612)

```typescript
{{30-50 lines around validate()}}
```

Lines 600-660 of the file. The rest of the file is not relevant to this review.
```

## 8. "Be creative" / "Think outside the box"

❌ Bad:
```
Suggest creative refactoring ideas.
```

Why it fails: GLM either gets cute (introduces weird patterns) or gets cautious (suggests trivial variable renames). Neither is useful.

✅ Good: anchor creativity with constraints.
```
Suggest 2-3 refactoring approaches. For each:
- The structural change (in 1-2 sentences)
- One concrete benefit (concrete = measurable or directly observable)
- One concrete cost / risk
- A rough effort estimate (hours, days, week+)

Prefer changes that pay off in less than a week of work.
```

## 9. Forcing JSON output without a schema

❌ Bad:
```
Return a JSON object describing the issues.
```

Why it fails: GLM-5.1 produces *something* JSON-shaped but the keys vary run to run, some fields are missing, sometimes the JSON is wrapped in markdown code fences, sometimes not.

✅ Good: For v0.4.0, prefer markdown with a literal template (see `prompt-blocks.md`). If you really need JSON:

```
## Output format

Return ONLY a JSON object matching this exact shape (no markdown fences, no commentary):

{
  "intent": "<string>",
  "issues": [
    { "severity": "critical|major|minor", "file": "<string>", "title": "<string>", "fix": "<string>" }
  ],
  "looksGood": ["<string>", ...]
}
```

Even then, validate the output against the schema in `plugins/glm/schemas/review-output.schema.json` before trusting it.

## 10. Polite phrasing eating instruction weight

❌ Bad:
```
If you don't mind, could you maybe take a quick look and let me know if anything jumps out?
```

Why it fails: GLM mirrors the casual tone, returns a casual / shallow answer.

✅ Good: be direct. Politeness is for humans; GLM doesn't grade you on tone.

```
Review the diff below. Output structured findings under the headers `## Intent`, `## Issues`, `## Looks good`.
```
