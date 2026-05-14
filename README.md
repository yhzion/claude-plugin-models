# claude-plugin-glm

Claude Code 플러그인으로 z.ai의 **GLM-5.1** 모델에 작업을 위임합니다. 한국어 자연어로 "glm 에이전트에게 ~~ 시켜줘"라고 말하면 Claude Code가 알아서 GLM에 디스패치합니다.

> **상태:** MVP (v0.1.0) — 에이전트 위임 한 경로만 동작. 잡 트래킹·리뷰·셋업 슬래시 커맨드는 후속 단계.

## 무엇을 하나

이 플러그인은 *마켓플레이스 + 단일 플러그인* 구조입니다. 설치하면 Claude Code 안에서 `glm`이라는 서브에이전트가 활성화되고, 다음과 같은 한국어 트리거에 반응합니다:

- "glm 에이전트에게 이 함수 리뷰 시켜줘"
- "glm한테 이 로직 어떻게 생각하는지 물어봐"
- "glm으로 이 유틸 함수 짜줘"
- "glm에게 작성 시켜줘"

내부적으로는 부모 Claude Code 세션이 `claude --settings ~/.claude/settings.glm.json -p "<프롬프트>"`를 자식 프로세스로 띄워 GLM-5.1을 호출합니다.

## 설치

```bash
# 1) 마켓플레이스 등록 (이 repo가 곧 마켓플레이스)
claude plugins marketplace add yhzion/claude-plugin-glm

# 2) 플러그인 설치
claude plugins install glm@yhzion-glm
```

로컬 클론으로 테스트할 때는 GitHub 경로 대신 로컬 경로를 줘도 됩니다:

```bash
claude plugins marketplace add /path/to/local/claude-plugin-glm
claude plugins install glm@yhzion-glm
```

## 설정 (GLM API 키)

플러그인은 `~/.claude/settings.glm.json` 파일에서 z.ai API 토큰을 읽습니다. 아직 자동 셋업 커맨드(`/glm:setup`)는 구현되지 않았으므로 수동으로 파일을 작성하세요:

```json
{
  "model": "glm-5.1",
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<your-z.ai-token>",
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000"
  },
  "permissions": { "defaultMode": "auto" }
}
```

z.ai 코딩 플랜 가입 후 발급받은 토큰을 `ANTHROPIC_AUTH_TOKEN`에 넣습니다.

## 사용법

설치와 키 설정이 끝나면 Claude Code 세션에서 자연스럽게 호출하면 됩니다:

```
> glm 에이전트에게 src/auth.ts 함수 리뷰 시켜줘
```

Claude Code가 `glm` 서브에이전트로 디스패치하고, 서브에이전트는 GLM-5.1에 위임한 후 응답을 다음 형식으로 돌려줍니다:

```
## GLM Response
[GLM-5.1의 응답]
```

## 구조

```
claude-plugin-glm/                     # 마켓플레이스
├── .claude-plugin/marketplace.json    # 플러그인 목록
└── plugins/glm/                        # glm 플러그인
    ├── .claude-plugin/plugin.json
    └── agents/glm.md                   # GLM 위임 에이전트
```

설계 문서: [`docs/DESIGN.md`](docs/DESIGN.md)

## 테스트

가벼운 smoke 테스트는 Node 내장 러너로 실행합니다:

```bash
# 매니페스트 / 에이전트 구조 검증 (외부 의존성 없음)
node --test tests/*.test.mjs

# 실제 GLM API 왕복 호출까지 검증 (z.ai API 키 필요, 토큰 소모)
GLM_SMOKE=1 node --test tests/*.test.mjs
```

## 로드맵

| Phase | 항목 |
|-------|------|
| ✅ v0.1.0 | 마켓플레이스 + `glm` 위임 에이전트 |
| ⬜ v0.2.0 | `/glm:setup`, `/glm:rescue`, 잡 트래킹, 백그라운드 실행 |
| ⬜ v0.3.0 | `/glm:review` (git diff 기반 코드 리뷰) |
| ⬜ v0.4.0 | `glm-5-1-prompting` 스킬, README 폴리시 |

## 라이선스

MIT
