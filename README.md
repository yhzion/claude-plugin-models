# claude-plugin-glm

Claude Code 플러그인으로 z.ai의 **GLM-5.1** 모델에 작업을 위임합니다. 한국어 자연어로 "glm 에이전트에게 ~~ 시켜줘"라고 말하면 Claude Code가 알아서 GLM에 디스패치합니다.

> **상태:** v0.4.0 — `glm-companion` CLI, 슬래시 커맨드 6종 (`/glm:setup`, `/glm:rescue`, `/glm:review`, `/glm:status`, `/glm:result`, `/glm:cancel`), 잡 트래킹, foreground/background 실행, git diff 기반 코드 리뷰, 프롬프트 엔지니어링 스킬(`glm-5-1-prompting`, `glm-cli-runtime`, `glm-result-handling`).

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

설치와 키 설정이 끝나면 Claude Code 세션에서 자연스럽게 호출하면 됩니다.

**자연어 트리거** (간단한 1회 위임):
```
> glm 에이전트에게 src/auth.ts 함수 리뷰 시켜줘
```

**슬래시 커맨드** (잡 트래킹 포함, 백그라운드 가능):
```
/glm:setup                          # GLM 설정 파일 점검·생성
/glm:rescue 이 폴더 리팩터링 초안 작성  # foreground 위임
/glm:rescue --background <prompt>   # background 위임, 잡 ID 반환
/glm:review                          # 변경된 파일을 GLM이 리뷰 (working-tree 우선)
/glm:review --scope branch           # 현재 브랜치를 main과 비교해 리뷰
/glm:review --base v1.2.0            # 특정 ref와 비교
/glm:status                          # 진행 중 잡 목록 (최신순)
/glm:status <job-id>                 # 특정 잡 상태
/glm:result <job-id>                 # 잡 출력 가져오기
/glm:cancel <job-id>                 # 잡 취소
```

응답은 다음 형식으로 돌아옵니다:
```
## GLM Response (job <id>)
[GLM-5.1의 응답]
```

## 구조

```
claude-plugin-glm/                              # 마켓플레이스
├── .claude-plugin/marketplace.json             # 플러그인 목록
└── plugins/glm/                                # glm 플러그인
    ├── .claude-plugin/plugin.json
    ├── agents/
    │   ├── glm.md                              # 간단한 위임 에이전트
    │   └── glm-rescue.md                       # 잡 라이프사이클 위임 에이전트
    ├── commands/{setup,rescue,review,status,result,cancel}.md
    ├── prompts/review.md                       # 리뷰 프롬프트 템플릿
    ├── schemas/review-output.schema.json       # 리뷰 출력 구조 스키마
    ├── skills/
    │   ├── glm-cli-runtime/SKILL.md            # 컴패니언 CLI 호출 규약
    │   ├── glm-result-handling/SKILL.md        # 응답 표시 규칙
    │   └── glm-5-1-prompting/                  # GLM 프롬프트 엔지니어링
    │       ├── SKILL.md
    │       └── references/{prompt-blocks,glm-prompt-recipes,glm-prompt-antipatterns}.md
    └── scripts/
        ├── glm-companion.mjs                   # CLI 오케스트레이터
        └── lib/{state,claude-runner,git}.mjs   # 잡 상태 / 자식 프로세스 / git diff
```

잡 파일은 `~/.claude/glm-jobs/default/<job-id>.json` (또는 `GLM_JOBS_DIR` 환경변수 경로)에 저장됩니다.

설계 문서: [`docs/DESIGN.md`](docs/DESIGN.md)

## 스킬 (skills)

세 가지 스킬이 함께 제공됩니다. Claude Code가 적절한 시점에 자동으로 로드해 사용합니다 — 사용자가 직접 호출할 필요는 없지만, 어떤 규칙으로 GLM과 상호작용하는지 이해하고 싶을 때 읽어볼 수 있습니다.

| 스킬 | 언제 사용되나 |
|---|---|
| `glm-cli-runtime` | 에이전트가 `glm-companion`을 호출해야 할 때 — 서브커맨드 계약, exit code, 환경변수, 실패 복구 시퀀스 |
| `glm-result-handling` | GLM 응답을 사용자에게 표시해야 할 때 — `## GLM Response` 헤더, verbatim 전달, 빈 응답·잘림·거부 처리 |
| `glm-5-1-prompting` | GLM에 보낼 프롬프트를 조립할 때 — 블록 라이브러리, 5개 레시피, 10개 안티패턴 |

## Troubleshooting

| 증상 | 원인 / 조치 |
|---|---|
| `Settings file does not exist` | `~/.claude/settings.glm.json`이 없거나 `GLM_SETTINGS_PATH`가 잘못됨. `/glm:setup`을 실행하거나 수동으로 생성. |
| `Not a git repository` (review) | `/glm:review`는 git repo 안에서만 동작. 다른 디렉터리에서 실행 중인지 확인. |
| `Nothing to review` | working tree가 깨끗하고 브랜치 커밋도 없음. `git status`로 확인 후 `--base <ref>` 명시. |
| `401 Unauthorized` / 인증 실패 | z.ai 토큰이 만료됐거나 잘못됨. `~/.claude/settings.glm.json`의 `ANTHROPIC_AUTH_TOKEN` 재발급. |
| 잡이 무한 `running` 상태 | 자식 프로세스가 행. `/glm:cancel <id>`로 정리. 빈번하면 `--background` 대신 foreground 사용. |
| `ai-delegates`의 기존 `glm` 에이전트와 이름 충돌 | 둘 다 활성화돼 있으면 디스패치가 임의 — `ai-delegates/glm.md`를 비활성화하거나 이름 변경 권장. |

## 테스트

가벼운 smoke 테스트는 Node 내장 러너로 실행합니다:

```bash
# 매니페스트 / 에이전트 / 라이브러리 / CLI 구조 검증 (외부 의존성 없음)
node --test tests/*.test.mjs tests/lib/*.test.mjs

# 실제 GLM API 왕복 호출까지 검증 (z.ai API 키 필요, 토큰 소모)
GLM_SMOKE=1 node --test tests/smoke-*.test.mjs
```

## 로드맵

| Phase | 항목 |
|-------|------|
| ✅ v0.1.0 | 마켓플레이스 + `glm` 위임 에이전트 |
| ✅ v0.2.0 | `glm-companion` CLI, `/glm:setup` `/glm:rescue` `/glm:status` `/glm:result` `/glm:cancel`, 잡 트래킹, 백그라운드 실행, `glm-rescue` 에이전트 |
| ✅ v0.3.0 | `/glm:review` — git diff 기반 코드 리뷰 (working-tree / branch / 명시 base ref), 구조화 출력 (`## Intent`, `## Issues`, `## Looks good`) |
| ✅ v0.4.0 | `glm-5-1-prompting` + `glm-cli-runtime` + `glm-result-handling` 스킬, README 폴리시, MIT LICENSE |

## 라이선스

MIT
