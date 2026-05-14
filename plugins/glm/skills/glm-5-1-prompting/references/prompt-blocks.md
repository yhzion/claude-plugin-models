# Prompt blocks — the GLM-5.1 building set

Each block below is meant to be *pasted into* a larger prompt assembled from the three-section template (`## Background`, `## Request`, `## Context`). They are not standalone prompts.

## Persona blocks

GLM-5.1 anchors on the first persona statement it sees. Lead with one.

### Concise senior engineer

```
You are a senior backend engineer with 10+ years of production experience. You prioritize correctness, then maintainability, then performance. You speak plainly — no fluff.
```

### Security-focused reviewer

```
You are an application security engineer reviewing code changes. You care about: authentication, authorization, data exposure, injection (SQL/HTML/shell), unsafe deserialization, and secret handling. You ignore stylistic issues unless they hide a real risk.
```

### Korean-native engineer

```
당신은 10년 차 백엔드 엔지니어입니다. 한국어로 답하지만, 코드와 파일 경로, API 이름은 원문 그대로 둡니다. 핵심만 짚어 말합니다.
```

## Output format blocks

GLM-5.1 follows literal format templates well. Show, don't describe.

### Structured review

```
## Output format

Return your review as markdown with this exact structure:

## Intent
<one sentence>

## Issues
### <severity>: <title>
**File:** path:line
**Why it matters:** <one sentence>
**Suggested fix:** <one-to-three sentences or a code snippet>

## Looks good
- <bullet per non-trivial correct handling>

Severity: critical | major | minor. Use critical only for bugs/security blocking merge.
```

### Decision matrix

```
## Output format

Return a markdown table:

| Option | Pros | Cons | When to choose |
|--------|------|------|----------------|
| A      |      |      |                |
| B      |      |      |                |

Then below the table, a 2-3 sentence recommendation.
```

### Code-only

```
## Output format

Return ONLY the revised file content, in a fenced code block with the original language tag. No commentary before or after.
```

## Verification blocks

When correctness matters more than speed:

```
## Verify before answering

Before you finalize the answer:
1. Re-read the request and check you addressed it (not just adjacent topics).
2. Check whether you made any assumption that's not stated in the context. Surface those assumptions in a `## Assumptions` section.
3. If you cited a file path, function name, or line number, confirm it appears in the embedded context.
```

## Refusal blocks

Tell GLM to refuse when a precondition fails. Without this, GLM will *try* to help even with insufficient information.

```
## Refuse if

If the context does not actually contain the file referenced in the request, do NOT fabricate the file's contents. Instead, return:

> Cannot proceed — <file> was referenced but not embedded in the context. Re-run with the file included.
```

## Depth / coverage hints

GLM-5.1 sometimes returns a single point when you wanted multiple. Force coverage:

```
Be thorough — produce at least three distinct angles, even if some are smaller in scope.
```

```
List every concern you have, not just the top one. Use severity tags so the reader can prioritize.
```

## Korean-specific quirks

- `~해줘`(반말) vs `~해주세요`(존댓말) doesn't materially change output, but consistency within a prompt helps.
- Asking GLM to "한국어로 답해" works, but if your `## Context` has English code/error messages, GLM will (correctly) keep those untranslated.
- For mixed-script content (file paths with English + Korean code comments), don't ask for translation — readability suffers.
