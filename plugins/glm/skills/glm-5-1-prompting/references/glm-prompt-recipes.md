# GLM-5.1 prompt recipes

Composed templates for common task shapes. Copy-paste, fill in `{{...}}`, dispatch via `glm-companion task`.

## Recipe 1 — Code review (full diff)

The shipped `/glm:review` already uses a polished version of this. Reproduced here for non-review review use cases (e.g., reviewing a single file rather than a diff).

```
You are a senior engineer reviewing a code change.

## Background
{{WHY THIS CHANGE EXISTS — one paragraph}}

## Request
Review the file below. Surface real issues only — correctness, regression risk, security, performance, missing tests. Skip cosmetic nits unless they hide a real concern.

## Context

File: {{PATH}}

```{{LANGUAGE}}
{{FILE CONTENT}}
```

## Output format

## Intent
<one sentence inferred from the code>

## Issues
### <severity>: <title>
**File:** {{PATH}}:<line>
**Why it matters:** <one sentence>
**Suggested fix:** <one-to-three sentences>

## Looks good
- <bullet per non-trivial correct handling>

Severity: critical | major | minor.
```

## Recipe 2 — Targeted refactor

```
You are a refactoring assistant. You preserve all observable behavior and improve clarity, modularity, or performance only where requested.

## Background
{{CURRENT PROBLEM — one paragraph}}

## Request
Refactor the file below to {{SPECIFIC GOAL — "extract validation into a separate function", "reduce nesting depth below 4", etc.}}. Do not change anything else.

## Context

File: {{PATH}}

```{{LANGUAGE}}
{{FILE CONTENT}}
```

## Output format

Return ONLY the revised file content in a fenced code block with the original language tag. No commentary before or after.

## Verify before answering

Before you finalize:
1. Re-read the original. Is observable behavior preserved? (Same inputs → same outputs, including thrown errors and side effects.)
2. Are imports/exports unchanged?
3. Did you accidentally rename a public symbol?

If the answer to any verification is uncertain, return a `## Concerns` section listing what you couldn't fully verify, then the refactored code.
```

## Recipe 3 — Design exploration (2-3 alternatives)

```
You are a software architect helping evaluate design alternatives.

## Background
{{WHY A DECISION IS NEEDED}}

## Request
Propose 2-3 alternative designs that solve the requirements below. For each, give pros, cons, and the conditions under which it's the right choice. End with a recommendation.

## Context

### Requirements
- {{REQ 1}}
- {{REQ 2}}
- ...

### Constraints
- {{CONSTRAINT 1 — e.g., "must work on Node 18+"}}
- {{CONSTRAINT 2}}

### Existing code (if relevant)

```{{LANGUAGE}}
{{KEY EXISTING SHAPES — interfaces, types, key call sites}}
```

## Output format

| Option | Sketch | Pros | Cons | When to choose |
|--------|--------|------|------|----------------|
| A      |        |      |      |                |
| B      |        |      |      |                |
| C      |        |      |      |                |

## Recommendation
<2-3 sentences. Pick one and state the tradeoff you're accepting.>
```

## Recipe 4 — Bug diagnosis (symptom + repro → likely causes)

```
You are a senior engineer debugging a production issue.

## Background
{{ENVIRONMENT, RECENT CHANGES, ANYTHING THAT MATTERS}}

## Request
Identify the most likely causes of the symptom below and, for each cause, suggest a concrete experiment to confirm or rule it out.

## Context

### Symptom
{{WHAT THE USER OBSERVES — error message, wrong output, performance regression, etc.}}

### Reproduction
{{STEPS TO REPRO if known. If not, "intermittent" + frequency.}}

### Relevant code

```{{LANGUAGE}}
{{KEY FUNCTIONS / CALL SITES}}
```

### Relevant logs / stack trace (if any)

```
{{LOGS}}
```

## Output format

## Most likely causes
1. **<cause>** — why this fits, what to check next.
2. **<cause>** — ...
3. **<cause>** — ...

## Less likely but worth ruling out
- **<cause>** — quick check.

Each cause must include a concrete next step (a command to run, a log line to grep for, a hypothesis to print).
```

## Recipe 5 — Documentation pass

```
You are a technical writer. You document for engineers who already know the language but not this codebase.

## Background
{{WHAT THIS MODULE DOES IN THE LARGER SYSTEM}}

## Request
Write {{a JSDoc/TSDoc/Python docstring | a README section | API reference entries}} for the code below. Be precise about types, side effects, and error conditions.

## Context

```{{LANGUAGE}}
{{CODE}}
```

## Output format

{{For docstring: return ONLY the docstring block, formatted to match the language's conventions.}}
{{For README: return a markdown section starting with `## <Heading>`.}}

## Constraints

- Do not invent behaviors. If something is unclear from the code, say so in a `## Open questions` section instead of guessing.
- Document the public API only. Skip private helpers.
```

## Composing recipes

These are not exhaustive — they're starting points. Common composition:

- Take the *output format* from Recipe 1 (review structure)
- Combine with the *persona* from Recipe 3 (architect)
- Apply to a single-file context (Recipe 1's context shape)

This produces "architect-style review of one file" prompts.

When you compose, keep the three top-level sections (`## Background` / `## Request` / `## Context`) and add `## Output format`, `## Verify before answering`, or `## Refuse if` as needed below them.
