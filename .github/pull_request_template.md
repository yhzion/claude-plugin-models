## Summary

<!-- 한 줄~세 줄로 이 PR이 *왜* 필요한지. "무엇을 했는가"는 diff가 말해주므로, "왜 했는가"에 집중. -->

## Roadmap context

<!-- 어떤 버전(예: v0.2.0)의 어떤 항목인지. docs/DESIGN.md의 Implementation Phases와 연결. -->

- Version target:
- Phase / item:

## Changes

<!-- 카테고리별 변경 요약. 파일 경로 + 한 줄 설명 권장. -->

- New:
- Modified:
- Removed:

## Test plan

<!-- 사용자가 이 PR을 검증하기 위해 실행할 명령. 가능한 한 복붙 가능한 형태로. -->

```bash
node --test tests/*.test.mjs                  # offline smoke tests
GLM_SMOKE=1 node --test tests/*.test.mjs      # live z.ai/GLM-5.1 round-trip
```

- [ ] Offline tests pass
- [ ] Live smoke test passes (if applicable)
- [ ] Manually verified the new slash command / agent in a Claude Code session

## Breaking changes / migration notes

<!-- 사용자가 이미 설치해 쓰고 있다면 영향을 받는 부분. 없으면 "None". -->

None.

## Follow-ups

<!-- 이 PR에서 의도적으로 빼놓은 항목. 후속 PR로 다룰 것들. -->

-
