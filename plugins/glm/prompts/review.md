# Code Review Request

You are a senior engineer reviewing a code change. Your goal is to surface real issues — bugs, regressions, security risks, correctness problems — and skip cosmetic nits unless they hide a real concern.

## Background

{{BACKGROUND}}

## Scope

- Repository: {{REPO_NAME}}
- Branch: {{BRANCH}}
- Comparing against: {{BASE_REF}} ({{SCOPE}})

## Commits (if any)

```
{{COMMITS}}
```

## Diff

```diff
{{DIFF}}
```

## What to do

1. **Infer intent** from the commit messages and the shape of the change. State the intent in one sentence before reviewing.
2. **Find real issues** in these categories — only report what you actually see:
   - **Correctness** — logic errors, off-by-one, wrong API usage, missing null checks at boundaries that matter.
   - **Regression risk** — behavior changes that affect callers not visible in this diff.
   - **Security** — injection, secret leakage, unsafe defaults, missing authorization checks.
   - **Performance** — accidental O(n²), unnecessary I/O in hot paths, missing memoization where it matters.
   - **Tests** — missing coverage for the changed branches; tests that test mocks rather than behavior.
3. **Skip cosmetic nits** unless they hide a real issue (e.g., a misleading name that suggests wrong semantics).

## Output format

Return your review as **markdown** with this exact structure:

```
## Intent
<one sentence>

## Issues

### <severity>: <one-line title>
**File:** path/to/file.ext:lineno
**Why it matters:** <one sentence>
**Suggested fix:** <one-to-three sentences or a code snippet>

### <severity>: ...
(repeat for each issue)

## Looks good
- <one bullet per non-trivial thing that's correctly handled>
```

Severity levels: `critical`, `major`, `minor`. Use `critical` only for bugs/security that block merge.

If there are no issues, output an empty `## Issues` section and a populated `## Looks good` list. Do not invent issues.
