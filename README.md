# claude-plugin-models

Claude Code에서 외부 AI 모델을 사용하게 해주는 플러그인 모음. 현재 수록: **`glm`** (z.ai GLM-5.1 위임), **`gemini`** (Google Gemini 위임). 한국어 자연어로 "glm 에이전트에게 ~~ 시켜줘" / "gemini한테 이거 물어봐"라고 말하면 Claude Code가 해당 모델로 디스패치합니다.

> **상태:** v0.6.0 — GLM은 v0.5.0 surface 그대로(`glm-companion` CLI, 슬래시 커맨드 6종, 잡 트래킹, `/glm:review`, 스킬 3종). Gemini 플러그인 MVP 추가: `gemini-companion` CLI, 슬래시 커맨드 6종, `/gemini:review`, 스킬 3종. **process-group 기반 cancel** (gemini CLI는 SIGTERM 무시).

## 무엇을 하나

이 저장소는 *마켓플레이스 + N개의 플러그인* 구조로, 각 플러그인이 하나의 외부 모델/서비스를 Claude Code에 연결합니다. 현재 두 개의 플러그인이 들어있으며 (`glm`, `gemini`), 설치하면 동일한 이름의 서브에이전트가 활성화되어 다음과 같은 한국어 트리거에 반응합니다:

- "glm 에이전트에게 이 함수 리뷰 시켜줘"
- "gemini한테 이 로직 어떻게 생각하는지 물어봐"
- "glm으로 이 유틸 함수 짜줘"
- "gemini에게 작성 시켜줘"

내부적으로는 부모 Claude Code 세션이 자식 프로세스를 띄워 모델을 호출합니다:

- **GLM:** `claude --settings ~/.claude/settings.glm.json -p "<프롬프트>"` (z.ai의 Anthropic 호환 엔드포인트)
- **Gemini:** `gemini -p "<프롬프트>"` (Google `gemini` CLI; OAuth 또는 `GEMINI_API_KEY`로 인증)

## 주요 기능

플러그인 간 인터페이스는 거의 동일합니다 — 차이는 모델 / 인증 방식에 한정.

- **자연어 디스패치** — "glm 에이전트에게 ~~ 시켜줘" / "gemini한테 ~~ 물어봐" 같은 한국어 트리거로 자동 위임
- **슬래시 커맨드 6종 × 2 플러그인** — 각각 `{setup, rescue, review, status, result, cancel}` (`/glm:*`, `/gemini:*`)
- **잡 트래킹** — 모든 위임이 `~/.claude/glm-jobs/` 또는 `~/.claude/gemini-jobs/`에 영구 기록 (상태, PID, 로그, 결과)
- **Foreground / Background** — 짧은 질의는 동기 응답, 큰 작업은 백그라운드로 ID만 받고 진행
- **코드 리뷰** — `/glm:review` 또는 `/gemini:review`로 working-tree, 브랜치, 명시 base ref 비교 리뷰 (구조화 출력)
- **프롬프트 스킬** — 플러그인당 3종(`*-cli-runtime`, `*-result-handling`, `*-prompting`)이 자동 로드되어 일관된 상호작용 보장

## 요구사항

공통:
- **Claude Code** (CLI 또는 데스크탑 앱)
- **Node.js 18+** — 두 컴패니언 모두 실행에 필요 (Node 내장 모듈만 사용)
- **git** — `/glm:review` 또는 `/gemini:review`를 사용할 경우 (저장소 안에서 호출)

`glm` 플러그인 추가:
- **z.ai 코딩 플랜** — 또는 Anthropic 호환 토큰이 있는 GLM 엔드포인트

`gemini` 플러그인 추가:
- **`gemini` CLI** — https://github.com/google-gemini/gemini-cli 에서 설치 (`npm install -g @google/gemini-cli` 등)
- **인증** — `gemini`를 터미널에서 한 번 실행해 OAuth 완료, 또는 `GEMINI_API_KEY` 환경변수 설정

## 설치

```bash
# 1) 마켓플레이스 등록 (이 repo 자체가 마켓플레이스)
claude plugins marketplace add yhzion/claude-plugin-models

# 2) 원하는 플러그인 설치 (둘 다 받아도 됨)
claude plugins install glm@claude-plugin-models
claude plugins install gemini@claude-plugin-models

# 3) Claude Code 재시작 (슬래시 커맨드와 에이전트 로드)

# 4) 검증: /help 입력 시 다음이 보여야 정상
#    - /glm:setup, /glm:rescue, /glm:review, /glm:status, /glm:result, /glm:cancel
#    - /gemini:setup, /gemini:rescue, /gemini:review, /gemini:status, /gemini:result, /gemini:cancel
#    - /agents에서 glm, glm-rescue, gemini, gemini-rescue 네 서브에이전트
```

**로컬 개발/테스트** — GitHub 경로 대신 로컬 클론 경로를 줘도 됩니다:

```bash
claude plugins marketplace add /path/to/local/claude-plugin-models
claude plugins install glm@claude-plugin-models
claude plugins install gemini@claude-plugin-models
```

## Quick Start

설치 직후 3단계로 동작을 확인합니다.

### 1. API 키 설정

```
/glm:setup
```

`~/.claude/settings.glm.json`이 없으면 z.ai API 토큰을 묻습니다 (없으면 [z.ai 코딩 플랜](https://z.ai)에서 발급). 있으면 점검만 하고 `GLM ready — ...` 메시지를 반환합니다.

설정 파일을 수동으로 만들고 싶다면:

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

### 2. 가장 짧은 GLM 왕복

```
/glm:rescue Reply with exactly one word: pong
```

응답이 다음 형식으로 오면 동작 정상입니다:

```
## GLM Response (job glm-task-xxxxxxxx)
pong
```

### 3. 의미 있는 첫 사용

```
/glm:review                                # 현재 디렉터리의 변경 사항을 GLM이 리뷰
```

또는 자연어로:

```
> glm 에이전트에게 README 한 줄 요약 시켜줘
```

여기까지 동작했다면 모든 게 정상입니다. 다음은 [사용법](#사용법)에서 커맨드별 디테일을 참조하세요.

> **Gemini도 동일 흐름**: `/gemini:setup` → `/gemini:rescue Reply with exactly: pong` → `/gemini:review`. 차이는 인증뿐 — z.ai 토큰 대신 OAuth(터미널에서 `gemini` 한 번 실행) 또는 `GEMINI_API_KEY` env. 응답은 `## Gemini Response (job gemini-task-...)` 헤더로 옵니다. 설정 파일은 만들지 않습니다 — `gemini` CLI가 `~/.gemini/`에서 자체 관리.

## 사용법

### `/glm:setup`

GLM 설정을 확인·생성합니다. 설정 파일이 있으면 점검만, 없으면 토큰을 묻고 파일을 만듭니다.

```
/glm:setup
/glm:setup --json     # 스크립트용 JSON 출력
```

### `/glm:rescue`

GLM에 작업을 위임합니다. 기본은 foreground (응답 받을 때까지 대기), `--background`로 비동기 위임.

```
/glm:rescue 이 함수의 시간 복잡도를 분석해줘
/glm:rescue --background 폴더 전체 리팩터링 초안을 작성해줘
/glm:rescue --json <prompt>      # JSON 출력
```

### `/glm:review`

git diff 기반 코드 리뷰. 자동으로 working-tree(더러우면) 또는 `main..HEAD` 브랜치 비교를 선택합니다.

```
/glm:review                          # 자동 스코프
/glm:review --scope working-tree     # 강제: working-tree
/glm:review --scope branch           # 강제: 브랜치 vs main
/glm:review --base v1.2.0            # 특정 ref와 비교
/glm:review --background             # 큰 변경은 백그라운드로
```

출력은 구조화된 마크다운 (`## Intent` / `## Issues` (severity: critical/major/minor) / `## Looks good`).

### `/glm:status`

진행 중·완료된 잡 목록을 최신순으로. 잡 ID를 주면 단일 잡의 상세 레코드.

```
/glm:status                  # 전체 잡 목록
/glm:status glm-task-abc12   # 특정 잡 상세
/glm:status --json
```

### `/glm:result`

잡의 캡처된 출력(GLM의 stdout)을 가져옵니다. 진행 중인 백그라운드 잡도 부분 결과를 보여줍니다.

```
/glm:result glm-task-abc12
/glm:result glm-task-abc12 --json
```

### `/glm:cancel`

실행 중인 백그라운드 잡을 종료(SIGTERM)하고 상태를 `cancelled`로 표시합니다. 이미 끝난 잡엔 영향 없음 (idempotent).

```
/glm:cancel glm-task-abc12
```

### 자연어 트리거

슬래시 커맨드 외에도 자연어로 호출 가능합니다. Claude Code가 의도를 매칭해 `glm` 또는 `glm-rescue` 서브에이전트로 디스패치합니다.

```
> glm 에이전트에게 src/auth.ts 보안 관점에서 리뷰 시켜줘
> glm한테 이 SQL 쿼리 어떻게 생각하는지 물어봐
> 백그라운드로 glm한테 폴더 리팩터링 시켜줘     # → glm-rescue로 디스패치
```

응답은 항상 다음 형식으로 옵니다:

```
## GLM Response (job <id>)
[GLM-5.1의 응답]
```

### Gemini는?

위 6개 슬래시 커맨드 + 자연어 트리거가 그대로 `/gemini:*`, "gemini한테 ~~", "gemini 에이전트에게 ~~"로 미러됩니다. 모든 플래그·동작·출력 구조가 동일하며, **두 가지만 다릅니다**:

- **인증** — `/gemini:setup`은 점검 전용 (settings 파일을 만들지 않음). gemini CLI가 자체 OAuth(`~/.gemini/oauth_creds.json`) 또는 `GEMINI_API_KEY` env로 관리.
- **모델 오버라이드** — `/gemini:rescue --model gemini-2.5-flash <prompt>`로 잡 단위 모델 선택 가능 (기본은 `gemini-3.1-pro-preview`). `gemini-2.5-flash`는 코드 리뷰·짧은 Q&A에 충분히 빠르고 저렴.

응답 헤더는 `## Gemini Response (job gemini-task-<id>)` 또는 리뷰의 경우 `## Gemini Review (...)`. 자세한 차별점은 `plugins/gemini/skills/gemini-prompting/SKILL.md` 참고.

## 스킬 (skills)

세 가지 스킬이 함께 제공됩니다. Claude Code가 적절한 시점에 자동으로 로드해 사용합니다 — 사용자가 직접 호출할 필요는 없지만, 어떤 규칙으로 GLM과 상호작용하는지 이해하고 싶을 때 읽어볼 수 있습니다.

| 스킬 | 언제 사용되나 |
|---|---|
| `glm-cli-runtime` | 에이전트가 `glm-companion`을 호출해야 할 때 — 서브커맨드 계약, exit code, 환경변수, 실패 복구 시퀀스 |
| `glm-result-handling` | GLM 응답을 사용자에게 표시해야 할 때 — `## GLM Response` 헤더, verbatim 전달, 빈 응답·잘림·거부 처리 |
| `glm-5-1-prompting` | GLM에 보낼 프롬프트를 조립할 때 — 블록 라이브러리, 5개 레시피, 10개 안티패턴 |
| `gemini-cli-runtime` | 에이전트가 `gemini-companion`을 호출해야 할 때 — exit code 41(unauthenticated) 처리, process-group cancel 규약 |
| `gemini-result-handling` | Gemini 응답을 표시해야 할 때 — `## Gemini Response` 헤더, stderr 노이즈 제거, JSON 모드 토큰 stats |
| `gemini-prompting` | Gemini에 보낼 프롬프트를 조립할 때 — 모델 선택(pro-preview vs 2.5-flash), 블록 라이브러리, 레시피, 안티패턴 |

## Troubleshooting

공통:

| 증상 | 원인 / 조치 |
|---|---|
| `Not a git repository` (review) | `*/review` 커맨드는 git repo 안에서만 동작. 다른 디렉터리에서 실행 중인지 확인. |
| `Nothing to review` | working tree가 깨끗하고 브랜치 커밋도 없음. `git status`로 확인 후 `--base <ref>` 명시. |
| 잡이 무한 `running` 상태 | 자식 프로세스가 행. `/glm:cancel <id>` 또는 `/gemini:cancel <id>`로 정리. 빈번하면 `--background` 대신 foreground 사용. |
| 슬래시 커맨드가 안 보임 | Claude Code 재시작 후 `/help`로 확인. 마켓플레이스 등록·설치 둘 다 했는지 점검. |

GLM 전용:

| 증상 | 원인 / 조치 |
|---|---|
| `Settings file does not exist` | `~/.claude/settings.glm.json`이 없거나 `GLM_SETTINGS_PATH`가 잘못됨. `/glm:setup`을 실행하거나 수동으로 생성. |
| `401 Unauthorized` / 인증 실패 | z.ai 토큰이 만료됐거나 잘못됨. `~/.claude/settings.glm.json`의 `ANTHROPIC_AUTH_TOKEN` 재발급. |
| `ai-delegates`의 기존 `glm` 에이전트와 이름 충돌 | 둘 다 활성화돼 있으면 디스패치가 임의 — `ai-delegates/glm.md`를 비활성화하거나 이름 변경 권장. |

Gemini 전용:

| 증상 | 원인 / 조치 |
|---|---|
| `gemini CLI not found or not executable` | `gemini` CLI 미설치. https://github.com/google-gemini/gemini-cli 에서 설치 (`npm install -g @google/gemini-cli` 등). 또는 `GEMINI_BIN` env로 다른 경로 지정. |
| `unauthenticated` / exit code 41 | gemini CLI는 설치됐지만 인증 미완. 터미널에서 `gemini`를 한 번 실행해 OAuth 완료, 또는 `GEMINI_API_KEY` env 설정 후 `/gemini:setup` 재실행. |
| 백그라운드 잡이 `/gemini:cancel` 후에도 살아 있는 듯 | gemini CLI가 SIGTERM을 자체 무시하므로 companion은 process-group SIGTERM → SIGKILL escalation을 수행. 정상적으론 그래도 죽지만, 의심되면 `ps -ef \| grep gemini`로 확인 후 직접 `kill -9 <pid>`. |

## 구조

```
claude-plugin-models/                           # 마켓플레이스
├── .claude-plugin/marketplace.json             # 플러그인 목록
├── plugins/glm/                                # glm 플러그인 (외부 모델 #1)
│   ├── .claude-plugin/plugin.json
│   ├── agents/
│   │   ├── glm.md                              # 간단한 위임 에이전트
│   │   └── glm-rescue.md                       # 잡 라이프사이클 위임 에이전트
│   ├── commands/{setup,rescue,review,status,result,cancel}.md
│   ├── prompts/review.md                       # 리뷰 프롬프트 템플릿
│   ├── schemas/review-output.schema.json       # 리뷰 출력 구조 스키마
│   ├── skills/
│   │   ├── glm-cli-runtime/SKILL.md            # 컴패니언 CLI 호출 규약
│   │   ├── glm-result-handling/SKILL.md        # 응답 표시 규칙
│   │   └── glm-5-1-prompting/                  # GLM 프롬프트 엔지니어링
│   │       ├── SKILL.md
│   │       └── references/{prompt-blocks,glm-prompt-recipes,glm-prompt-antipatterns}.md
│   └── scripts/
│       ├── glm-companion.mjs                   # CLI 오케스트레이터
│       └── lib/{state,claude-runner,git}.mjs   # 잡 상태 / 자식 프로세스 / git diff
└── plugins/gemini/                             # gemini 플러그인 (외부 모델 #2)
    ├── .claude-plugin/plugin.json
    ├── agents/{gemini,gemini-rescue}.md        # 위임 / 잡 라이프사이클 에이전트
    ├── commands/{setup,rescue,review,status,result,cancel}.md
    ├── prompts/review.md                       # 리뷰 프롬프트 템플릿
    ├── schemas/review-output.schema.json       # 리뷰 출력 구조 스키마
    ├── skills/
    │   ├── gemini-cli-runtime/SKILL.md         # 컴패니언 CLI 호출 규약 (process-group cancel)
    │   ├── gemini-result-handling/SKILL.md     # 응답 표시 규칙 (stderr 노이즈 분리)
    │   └── gemini-prompting/SKILL.md           # Gemini 프롬프트 엔지니어링 (모델 선택 포함)
    └── scripts/
        ├── gemini-companion.mjs                # CLI 오케스트레이터
        └── lib/{state,gemini-runner,git}.mjs   # 잡 상태 / detached spawn+그룹 kill / git diff
```

잡 파일은 `~/.claude/glm-jobs/default/<job-id>.json` (또는 `GLM_JOBS_DIR`), `~/.claude/gemini-jobs/default/<job-id>.json` (또는 `GEMINI_JOBS_DIR`)에 저장됩니다.

설계 문서: [`docs/DESIGN.md`](docs/DESIGN.md)

## 테스트

가벼운 smoke 테스트는 Node 내장 러너로 실행합니다:

```bash
# 매니페스트 / 에이전트 / 라이브러리 / CLI 구조 검증 (외부 의존성 없음, 두 플러그인 모두 포함)
node --test tests/*.test.mjs tests/lib/*.test.mjs

# 실제 GLM API 왕복 호출까지 검증 (z.ai API 키 필요, 토큰 소모)
GLM_SMOKE=1 node --test tests/smoke-glm.test.mjs tests/smoke-companion.test.mjs tests/smoke-review.test.mjs
```

`tests/smoke-gemini.test.mjs`는 `GEMINI_BIN=/bin/true` 스텁으로 CLI 구조만 검증해 외부 의존성/토큰 소모 없이 항상 실행됩니다. Gemini API 왕복까지의 end-to-end smoke는 OAuth 의존성으로 현재 자동화되어 있지 않습니다.

## 로드맵

| Phase | 항목 |
|-------|------|
| ✅ v0.1.0 | 마켓플레이스 + `glm` 위임 에이전트 |
| ✅ v0.2.0 | `glm-companion` CLI, `/glm:setup` `/glm:rescue` `/glm:status` `/glm:result` `/glm:cancel`, 잡 트래킹, 백그라운드 실행, `glm-rescue` 에이전트 |
| ✅ v0.3.0 | `/glm:review` — git diff 기반 코드 리뷰 (working-tree / branch / 명시 base ref), 구조화 출력 (`## Intent`, `## Issues`, `## Looks good`) |
| ✅ v0.4.0 | `glm-5-1-prompting` + `glm-cli-runtime` + `glm-result-handling` 스킬, README 1차 폴리시, MIT LICENSE |
| ✅ v0.5.0 | README 재구성 (마켓플레이스 컨벤션 적용) — 요구사항·Quick Start·커맨드별 사용법 명시화 |
| ✅ v0.6.0 | `gemini` 플러그인 MVP — `gemini-companion` CLI, 슬래시 커맨드 6종, `/gemini:review` (git diff 기반), 스킬 3종, OAuth/`GEMINI_API_KEY` 기반 인증, 시그널 무시 CLI에 대한 process-group cancel |

## 라이선스

MIT
