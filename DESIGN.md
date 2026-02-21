# DESIGN

## 1. 문서 목적
이 문서는 `REQUIREMENTS.md`의 `RQ-001 ~ RQ-006`을 구현하기 위한 기본 설계 기준이다.  
목표는 원본 `../jwmemo`의 기능 동등성을 유지하면서 기술 스택을 단계적으로 교체하는 것이다.

## 2. 설계 원칙
1. 기능 동등성 우선: 기존 API/주요 UX(목록, 상세, 작성, 저장)를 먼저 맞춘다.
2. 점진적 교체: DB, 프런트엔드, 에디터를 분리된 단계로 전환한다.
3. 환경변수 기반 구성: 민감정보와 환경별 설정은 코드에 하드코딩하지 않는다.
4. 검증 가능성: 각 단계 완료 시 자동/반자동 확인 절차를 둔다.

## 3. 목표 아키텍처
### 3.1 백엔드
- 런타임: Node.js
- 프레임워크: Express
- 데이터 접근: Mongoose
- 연결: `process.env.MONGODB_URI`
- API 기준 경로: `/jnote/*` (원본 호환)

### 3.2 프런트엔드
- 런타임/빌드: Vite
- UI 계층: Lithent
- 에디터: `monaco-editor` + `monaco-vim`
- 미리보기: Markdown 렌더링 뷰어(에디터와 라인 기준 동기화 지원)

### 3.3 데이터 저장소
- 대상: MongoDB Atlas
- 기준 DB명: `jmemo`
- 초기 데이터 소스: 프로젝트 루트 `mongo-all.archive` (gzip archive)

## 4. 디렉터리/모듈 구조(초안)
```text
memo/
  src/
    app/                 # 앱 부트스트랩
    features/notes/      # 노트 도메인(UI + 상태 + API)
    features/editor/     # Monaco + Vim 통합
    features/preview/    # Markdown 렌더링 + 라인 매핑
    shared/              # 공통 유틸/타입
  server/
    app.mjs              # Express 초기화
    routes/jnote.mjs     # /jnote 라우트
    models/              # Jmemo, Category
    services/            # 비즈니스 로직
  scripts/
    check-env.mjs
    db-ping.mjs
    db-shell.mjs
```

## 5. API 호환 설계
원본 `../jwmemo/controller/JnoteController.js` 기준으로 아래 엔드포인트를 우선 유지한다.
- `POST /jnote/create`
- `GET /jnote/read`
- `GET /jnote/read/:id`
- `POST /jnote/update`
- `POST /jnote/delete`
- `POST /jnote/upload`

리팩토링 단계에서 내부 구현(서비스/레포지토리 분리)은 변경 가능하나, 요청/응답 형식은 기존 클라이언트 동작을 깨지 않도록 유지한다.

## 6. MongoDB Atlas 마이그레이션 설계
### 6.1 사전 준비
- Atlas 클러스터/유저 생성
- IP Allow List 등록
- `.env`에 `MONGODB_URI` 설정
- 연결 점검: `pnpm run env:check`, `pnpm run db:ping`

Atlas IP Allow List 기준값(2026-02-21 기준):
- `221.150.15.64/32`: 개발자 로컬(집) IP, 초기/수동 마이그레이션 작업용
- `159.223.120.99/32` (`subtleflo`): 배포 운영 서버 IP, 런타임 접속용

운영 원칙:
- 운영 환경에서는 `subtleflo` IP가 반드시 등록되어 있어야 한다.
- 로컬 IP는 수동 작업(이관/점검) 시 필요하며, IP 변경 시 즉시 Atlas Allow List를 갱신한다.

### 6.2 복원 방식
`mongo-all.archive`는 gzip archive이므로 `mongorestore --gzip --archive`를 사용한다.  
전역 설치를 피하기 위해 복원은 Docker 실행을 기본안으로 둔다.

```bash
docker run --rm \
  -v "$PWD:/work" \
  -e MONGODB_URI="$MONGODB_URI" \
  mongo:8 \
  sh -lc 'mongorestore --uri "$MONGODB_URI" --gzip --archive=/work/mongo-all.archive --nsInclude="jmemo.*"'
```

### 6.3 검증
- 컬렉션 문서 수 비교(`jmemo` 주요 컬렉션)
- 노트 CRUD 샘플 시나리오 검증
- 앱 실제 구동 후 목록/상세/수정/삭제 동작 확인

### 6.4 컷오버 전략(확정)
본 프로젝트는 단일 사용자 운영 전제를 사용하며, 아래의 `2회 마이그레이션` 전략을 기본으로 한다.

1. 1차 마이그레이션(개발 시작 전)
- 목적: 개발 환경을 Atlas 데이터 기준으로 맞춘다.
- 절차: `mongo-all.archive`를 Atlas `jmemo`로 복원하고 기본 검증을 수행한다.

2. 2차 마이그레이션(개발 완료/배포 직전)
- 목적: 개발 기간 동안 원본(`../jwmemo`)에 반영된 최신 데이터를 최종 반영한다.
- 절차: 원본 DB에서 최신 dump/archive를 다시 생성한 뒤, Atlas 대상 DB를 초기화하고 처음부터 재복원한다.
- 원칙: 최종 이관은 증분 반영이 아니라 `초기화 후 전체 재복원`으로 수행한다.

3. 전환(컷오버)
- 최종 복원 및 스모크 테스트 완료 후 운영 `MONGODB_URI`를 Atlas로 고정한다.
- 사용자 1인 운영이므로 점검 윈도우 동안 쓰기 중단 후 일괄 전환(Big Bang)을 적용한다.

### 6.5 원클릭 재마이그레이션 스크립트(추후 구현)
개발 중간/배포 직전 반복 이관을 위해, 아래 순서를 한 번에 수행하는 스크립트를 준비한다.

1. 입력: 최신 dump/archive 파일 경로
2. `jmemo` 대상 DB 초기화(drop)
3. archive 전체 재복원(restore)
4. 기본 검증(ping + 컬렉션 수/핵심 조회 체크)
5. 결과 요약 출력(성공/실패, 대상 DB, 소요 시간)

실행 형태(설계안):
- `pnpm run migrate:reset -- --archive <path-to-archive>`
- 현재 턴에서는 문서에만 반영하며, 실제 스크립트 코드는 추후 구현한다.

## 7. Lithent 전환 설계
1. 화면 단위로 교체: 목록 → 상세 → 작성 순서
2. 상태 관리 단순화: 노트 리스트/선택/편집 상태를 도메인 단위로 분리
3. API 경계 고정: `src/features/notes/api`에서만 서버 통신
4. React 의존 제거 완료 시 `react*`, `redux*` 계열 패키지 미사용 상태를 완료 기준으로 본다.

## 8. Monaco + monaco-vim 설계
### 8.1 에디터 통합
- Monaco 인스턴스 생성 후 Vim 모드 어댑터 연결
- 기본 모드 전환(Insert/Normal), 이동/편집 키 동작 보장
- 저장 단축키와 기존 저장 플로우 연동

### 8.2 Preview 스크롤 동기화(RQ-006)
`normal! zz`의 의도는 “현재 라인을 Preview 중앙에 위치”시키는 것이다.  
Monaco 환경에서는 동일 개념을 아래 순서로 구현한다.

1. `onDidChangeCursorPosition`(CursorMoved 대응) 감지
2. `lineNumber` 획득
3. Preview 블록의 `data-line-start`/`data-line-end` 범위에서 `start <= lineNumber <= end`인 블록을 우선 탐색
4. 범위 매칭이 없으면 가장 가까운 이전 블록으로 보정
5. `scrollIntoView({ block: "center" })`로 중앙 정렬
6. 이벤트 과다 호출 방지를 위해 `requestAnimationFrame` 단위로 coalescing

### 8.3 이미지 업로드 저장 정책(확정)
- 저장소는 외부 스토리지로 확장하지 않고 로컬 파일 시스템을 유지한다.
- 업로드 파일은 `images/YYYYMMDD/<uuid>.<ext>` 규칙으로 저장한다.
- 에디터 본문에는 상대경로 Markdown 링크(`images/...`)를 즉시 삽입한다.
- 파일 정리 정책은 기존 동작과 동일하게 노트 수정/삭제 시 orphan 파일을 best-effort로 정리한다.
- 현재 사용 패턴상 기존 이미지 데이터 마이그레이션은 수행하지 않는다.

### 8.4 Markdown 렌더링/XSS 정책(확정)
- 본 프로젝트는 개인 사용 전제를 우선하며, 렌더링 사용성을 최우선으로 둔다.
- Markdown 렌더링 시 HTML 표현은 기본 허용한다(과도한 sanitize로 인한 표시 깨짐 방지).
- 단, 앱 안정성 보호를 위해 명백히 위험한 태그/속성(`script`, inline 이벤트 핸들러)은 최소 차단한다.
- 외부 공개/다중 사용자 전환 시 sanitize 강도 상향을 별도 작업으로 분리한다.

### 8.5 스크롤 동기화 이벤트 제어 정책(확정)
- 동기화 실행은 `requestAnimationFrame` 단위로 coalescing하여 프레임당 최대 1회만 수행한다.
- 마지막 동기화 라인과 동일한 `lineNumber` 이벤트는 무시한다.
- 같은 Preview 블록 범위 내 미세 이동은 재정렬을 생략해 점프를 줄인다.
- 사용자가 Preview를 수동 스크롤하면 짧은 쿨다운(예: 300ms) 동안 자동 동기화를 일시 중지한다.

### 8.6 Vim 키맵 충돌 우선순위 정책(확정)
- 기본 원칙: 에디터 포커스 상태에서는 Vim 키맵을 우선 적용한다.
- 예외 단축키: `Cmd/Ctrl + S`(저장), `Cmd/Ctrl + Z`/`Cmd/Ctrl + Shift + Z`(undo/redo)는 앱 단축키를 우선한다.
- `Esc` 우선순위: 모달/다이얼로그가 열려 있으면 UI 닫기를 우선하고, 그렇지 않으면 Vim normal 전환을 우선한다.
- 에디터 포커스가 아닐 때는 앱 전역/브라우저 기본 단축키를 유지한다.

### 8.7 저장 정책(확정)
- 저장 방식은 자동저장 없이 수동저장만 사용한다.
- 저장 트리거는 `Cmd/Ctrl + S`, 명시적 저장 버튼, Vim Ex 명령 `:w`로 제한한다.
- Vim Ex 명령 `:wq`는 `저장 후 종료(또는 에디터 닫기/목록 복귀)` 동작으로 매핑한다.
- 저장 전 상태는 로컬 편집 상태로 유지하고, 저장 성공 시에만 서버/DB 상태를 갱신한다.
- 페이지 이탈 시 자동 저장는 수행하지 않고, 미저장 변경 경고만 표시한다.

### 8.8 테스트 게이트 정책(확정)
- 본 프로젝트의 기본 게이트는 `권장 게이트(부분 자동 + 수동 체크리스트)`로 운영한다.
- 자동 게이트: `pnpm run env:check`, `pnpm run db:ping` 통과.
- 수동 게이트(핵심 시나리오): 노트 CRUD, 태그 부여/태그 검색, Vim `:w`/`:wq`, Preview 동기화 확인.
- 배포 직전 게이트: 재마이그레이션(`drop -> restore`) 완료 후 주요 컬렉션 수/핵심 동작 재검증.
- 위 항목 미통과 시 머지/배포를 진행하지 않는다.

### 8.9 운영 관측성 정책(확정)
- 로그는 구조화 포맷을 사용하고, 최소 필드 `time`, `level`, `requestId`, `route`, `status`, `latencyMs`를 남긴다.
- 민감정보(`MONGODB_URI`, 토큰, 쿠키)는 로그에 기록하지 않거나 마스킹한다.
- 헬스체크 엔드포인트를 분리한다: `GET /health/live`(프로세스 생존), `GET /health/ready`(DB ping 포함 준비 상태).
- `ready` 실패 시 HTTP `503`을 반환하고 원인 코드를 로그에 남긴다.
- 배포 직후 `live/ready` 확인을 운영 체크리스트의 필수 절차로 포함한다.

## 9. 단계별 구현 계획
1. **Phase 1 (기반)**: `.env`/DB 연결/Atlas ping 체계 확정
2. **Phase 2 (데이터)**: `mongo-all.archive` 복원 및 데이터 검증
3. **Phase 3 (백엔드)**: `/jnote` API 호환 레이어 정리
4. **Phase 4 (프런트)**: Lithent UI 이행 + 기능 동등성 확보
5. **Phase 5 (에디터)**: Monaco+Vim + Preview 동기화 완성
6. **Phase 6 (안정화)**: 회귀 테스트/성능 점검/문서 업데이트

## 10. 오픈 결정 사항
- (현재 없음)

## 11. 결정 체크리스트
아래 항목을 하나씩 확정하고, 확정 시 체크박스를 `[x]`로 변경한다.

- [x] DC-01 MVP 기능 범위 확정 (`완료`)
- [x] DC-02 `/jnote` API 호환 수준 확정 (`완료`)
- [x] DC-03 API의 ID 직렬화 규칙 확정 (`완료`)
- [x] DC-04 Atlas 인덱스 전략 확정 (`완료`)
- [x] DC-05 마이그레이션 컷오버 방식 확정 (`완료`)
- [x] DC-06 실패 시 롤백 기준/절차 확정 (`완료`)
- [x] DC-07 Atlas 복원 시 `--drop` 정책 확정 (`완료`)
- [x] DC-08 이미지 저장소 전략 확정 (`완료`)
- [x] DC-09 Markdown 렌더링/XSS 보안 정책 확정 (`완료`)
- [x] DC-10 Preview 라인 매핑 규칙 확정 (`완료`)
- [x] DC-11 스크롤 동기화 이벤트 제어 정책 확정 (`완료`)
- [x] DC-12 Vim 키맵 충돌 우선순위 확정 (`완료`)
- [x] DC-13 저장 정책(수동/자동저장) 확정 (`완료`)
- [x] DC-14 테스트 통과 기준(게이트) 확정 (`완료`)
- [x] DC-15 운영 관측성(로그/헬스체크) 기준 확정 (`완료`)

### 진행 규칙
- 결정할 때는 `DC-번호`를 명시한다.
- 확정 문구는 한 줄로 남긴다.
- 확정 후 체크박스를 `[x]`로 변경한다.
- 보류 시 `TBD`를 유지하고 보류 사유를 한 줄로 기록한다.

### 결정 로그
- DC-01: MVP 최소 범위는 `목록/상세/작성/수정/삭제 + 태그 부여 + 태그 검색`으로 확정한다. 이미지 드롭 업로드 후 에디터/뷰어 자동 반영은 권장 포함 기능으로 구현 목표에 포함한다.
- DC-02: 1차 릴리즈는 `/jnote` API를 경로/메서드/요청-응답/상태코드까지 완전 호환으로 유지하고, 2차 단계에서 내부 정규화(응답 포맷 통일)를 검토한다.
- DC-03: API 응답의 식별자 `_id`는 항상 문자열로 직렬화해 노출한다.
- DC-04: Atlas 인덱스는 `title`, `moddate`, `category`, `favorite`를 기본 전략으로 적용한다.
- DC-05: 컷오버는 Big Bang으로 하되, `개발 전 1차 이관 + 배포 직전 최신 데이터로 2차 전체 재이관`(초기화 후 복원) 전략을 사용한다.
- DC-06: 마이그레이션 실패 시 별도 롤백은 두지 않고, Atlas 대상 DB를 drop 후 최신 dump/archive로 처음부터 재마이그레이션하는 재시도 절차를 표준으로 사용한다.
- DC-07: Atlas 재이관은 기존 데이터를 drop 후 최신 dump/archive로 전체 restore하는 정책으로 확정하고, 이를 1회 실행 스크립트로 자동화한다(스크립트 구현은 추후).
- DC-08: 이미지 저장소는 로컬 파일 시스템(`images/YYYYMMDD/<uuid>.<ext>`)을 유지하고, 업로드 즉시 Markdown 경로를 삽입하며 기존 이미지 데이터 이관은 수행하지 않는다.
- DC-09: 개인 사용성 우선 정책으로 Markdown HTML은 기본 허용하고, `script`/inline 이벤트 핸들러만 최소 차단한다.
- DC-10: Preview 라인 매핑은 정밀 토큰 단위 대신 Markdown 블록 `start/end` 범위 매핑을 사용한다(`start <= line <= end`, 미매칭 시 이전 블록 보정).
- DC-11: 스크롤 동기화는 `rAF coalescing + 동일 라인 이벤트 skip + 동일 블록 미세 이동 생략 + 수동 스크롤 쿨다운(300ms)` 정책으로 제어한다.
- DC-12: 키 충돌 시 에디터 포커스에서는 Vim 우선, 단 저장/실행취소(`Cmd/Ctrl + S`, `Cmd/Ctrl + Z`, `Cmd/Ctrl + Shift + Z`)는 앱 우선으로 처리한다.
- DC-13: 저장은 자동저장 없이 수동저장만 사용하며, `Cmd/Ctrl + S`, 저장 버튼, Vim `:w`에서 DB 반영을 수행하고 `:wq`는 저장 후 종료로 처리한다.
- DC-14: 테스트 게이트는 `권장 게이트(자동 2종 + 수동 핵심 시나리오 + 배포 직전 재마이그레이션 검증)`를 통과해야 머지/배포 가능하도록 확정한다.
- DC-15: 운영 관측성은 `구조화 로그 + 민감정보 마스킹 + live/ready 헬스체크 분리 + ready 실패 시 503` 기준으로 확정한다.

## 12. 구현 계약 체크리스트(IC)
아래 항목은 구현 단계에서 시행착오를 줄이기 위한 상세 계약이다. 각 항목은 별도로 확정하고 체크한다.

- [x] IC-01 `/jnote` API 응답 스키마 예시(JSON) 고정 (`완료`)
- [x] IC-02 태그 검색 규칙(대소문자/정확일치/AND-OR) 고정 (`완료`)
- [x] IC-03 정렬/페이지네이션 기본값 고정 (`완료`)
- [x] IC-04 저장 실패 UX(메시지/재시도/로컬보존) 고정 (`완료`)
- [x] IC-05 Vim `:wq` 종료 동작(목록 복귀/에디터 닫기) 고정 (`완료`)
- [x] IC-06 미저장 경고 트리거(이동/새로고침/닫기) 고정 (`완료`)
- [x] IC-07 업로드 제한(확장자/크기/MIME) 고정 (`완료`)
- [x] IC-08 orphan 이미지 정리 시점(즉시/배치) 고정 (`완료`)
- [x] IC-09 Preview 라인 매핑 예외 fallback 규칙 고정 (`완료`)
- [x] IC-10 `migrate:reset` 스크립트 인자/종료코드 계약 고정 (`완료`)
- [x] IC-11 수동 테스트 체크리스트 파일(릴리즈용) 고정 (`완료`)
- [x] IC-12 API 에러 코드 사전(`VALIDATION_ERROR` 등) 고정 (`완료`)

### IC 진행 규칙
- 확정 시 체크박스를 `[x]`로 변경한다.
- 각 항목은 한 줄 결정 로그를 남긴다.
- 구현 전에 `IC-01 ~ IC-07`을 우선 확정한다.

### IC-01 API 응답 계약(확정)
- 기준선은 `../jwmemo` HEAD 커밋 `09d618329ac78deb892274eb590b4e4a91c8e270`(2025-02-05 07:21:34 +0000)으로 고정한다.
- 호환 범위는 성공/에러 응답 모두를 포함하며, 상태코드와 기본 응답 구조를 원본 기준으로 유지한다.
- 비정상 입력은 권장형 정규화를 적용한다: 잘못된 `id`/필수값 누락은 `400`, 리소스 없음은 `404`, 서버 예외는 `500`.
- 직렬화 규칙은 `_id` 문자열, `regdate`/`moddate`는 ISO-8601 문자열로 고정한다.
- `/jnote/upload` 응답은 `{"filepath":"uploads/<yyyymmdd>/<filename.ext>"}` 형식으로 고정한다.

### IC-02 태그 검색 계약(확정)
- 태그 검색은 대소문자를 무시한다(case-insensitive).
- 검색어가 여러 개인 경우 OR 조건으로 매칭한다(하나라도 일치하면 포함).
- 태그 필드는 검색 시 소문자 기준으로 정규화해 비교한다.

### IC-03 정렬/페이지네이션 계약(확정)
- 기본 정렬은 `favorite desc -> moddate desc -> _id desc`로 고정한다.
- 페이지네이션 파라미터는 `page`(1-base), `pageSize`를 사용한다.
- 기본값은 `page=1`, `pageSize=30`, 허용 범위는 `1 <= pageSize <= 100`으로 제한한다.
- 페이지네이션 응답은 `items`, `page`, `pageSize`, `total`, `hasNext` 메타를 포함한다.
- 원본 호환을 위해 `page/pageSize` 미전달 시 `/jnote/read`는 전체 반환 모드를 유지한다.

### IC-04 저장 실패 UX 계약(확정)
- 저장 실패 시 사용자에게 `저장 실패(원인)` 메시지를 표시하고 상태를 `저장 실패`로 유지한다.
- 편집 내용은 저장 실패 여부와 무관하게 로컬 편집 버퍼에 유지한다(데이터 유실 금지).
- `Cmd/Ctrl + S`, Vim `:w`, `재시도 버튼`은 모두 동일한 저장 재시도 경로를 사용한다.
- `:wq`에서 저장이 실패하면 종료를 중단하고 에디터를 유지한 채 실패 메시지를 표시한다.
- 미저장/저장실패 상태에서 페이지 이탈 시 경고를 표시한다.

### IC-05 Vim `:wq` 종료 동작 계약(확정)
- 기준 동작은 원본 `jwmemo`와 동일한 UX를 유지한다.
- 수정 모드(`write/:id`)에서 `:wq` 성공 시 `view/:id`로 이동한다.
- 신규 작성 모드(`write`)에서 `:wq` 성공 시 방금 생성된 노트의 `view/:newId`로 이동한다.
- `:wq` 실행 시 Preview가 열려 있으면 닫고 view 화면으로 전환한다.
- 저장 실패 시에는 IC-04 규칙을 우선 적용하며 종료/이동하지 않는다.

### IC-06 미저장 경고 트리거 계약(확정)
- `dirty` 상태 또는 `저장 실패` 상태에서 라우트 이동/새로고침/탭 닫기 시 미저장 경고를 표시한다.
- 저장 실패 상태에서 이동이 시도되면 경고 후 기본 동작은 `현재 편집 상태 유지(이탈 취소)`로 한다.
- 저장 실패 상태에서는 자동 이동/자동 종료를 수행하지 않으며, 사용자가 편집 화면에서 재시도할 수 있게 유지한다.
- 저장 성공 후 `dirty=false` 상태에서는 경고 없이 이동을 허용한다.

### IC-07 업로드 제한 계약(확정)
- 허용 확장자는 `jpg`, `jpeg`, `png`, `gif`, `webp`로 제한한다.
- 허용 MIME은 `image/jpeg`, `image/png`, `image/gif`, `image/webp`로 제한하고 확장자+MIME을 모두 검증한다.
- 최대 파일 크기는 파일당 `10MB`로 제한한다.
- 저장 파일명은 UUID 기반으로 생성하고 원본 파일명은 저장 경로 결정에 사용하지 않는다.
- 업로드 실패 응답은 `400(형식/용량 위반)` 또는 `500(저장 실패)`로 구분한다.
- SVG는 보안 위험을 고려해 업로드 허용 목록에서 제외한다.

### IC-08 orphan 이미지 정리 계약(확정)
- 노트 `update/delete` 성공 시 orphan 후보 이미지를 즉시 정리한다(best-effort).
- 즉시 정리 실패는 노트 저장/삭제 성공을 롤백하지 않고 `warn` 로그만 남긴다.
- 보강 수단으로 주기 배치 정리(예: 1일 1회)를 수행해 잔여 orphan 이미지를 재정리한다.
- 배치 정리 시 생성 후 24시간 이내 파일은 보호 대상에서 제외한다.

### IC-09 Preview 라인 매핑 fallback 계약(확정)
- 1차 규칙(`start <= line <= end`) 매칭 실패 시 가장 가까운 이전 블록을 fallback으로 사용한다.
- 이전 블록이 없으면 첫 블록을 fallback으로 사용한다.
- 렌더 블록이 전혀 없으면 동기화를 생략하고 현재 Preview 위치를 유지한다.
- fallback 결과가 현재 표시 블록과 동일하면 불필요한 스크롤을 수행하지 않는다.
- fallback 발생은 운영 로그가 아닌 `debug` 수준으로만 기록한다.

### IC-10 `migrate:reset` 스크립트 계약(확정)
- 필수 인자: `--archive <path>`; 기본 DB는 `--db jmemo`.
- 연결 정보는 `--uri` 또는 `.env`의 `MONGODB_URI`를 사용한다.
- 안전장치: `--yes`(또는 `--confirm`) 없이는 실제 drop/restore를 실행하지 않는다.
- `--dry-run`을 지원해 실행 계획만 출력할 수 있어야 한다.
- 실행 단계는 `precheck -> drop -> restore -> postcheck` 순서로 고정한다.
- 종료코드: `0`(성공), `2`(인자/입력 오류), `3`(연결 실패), `4`(drop 실패), `5`(restore 실패), `6`(postcheck 실패).
- 결과 출력은 마지막 줄에 `RESULT`, `EXIT_CODE`, `DB`, `ARCHIVE`를 포함한 요약을 남긴다.

### IC-11 수동 테스트 체크리스트 계약(확정)
- 릴리즈 수동 체크리스트 파일 경로는 저장소 루트의 `MANUAL_TEST_CHECKLIST.md`로 고정한다.
- 최소 섹션은 `사전 준비`, `핵심 플로우`, `에디터/Vim`, `Preview 동기화`, `이미지 업로드/정리`, `배포 직전 데이터 검증`, `서명`을 포함한다.
- 릴리즈 승인 조건은 치명/주요 결함 `0건`이며, 차선 결함은 이슈 링크 기록을 조건으로 승인 가능하다.
- `DC-13`(수동 저장), `DC-10/11`(라인 매핑/동기화), `IC-07/08/10`(업로드/정리/마이그레이션) 검증 항목을 반드시 포함한다.

### IC-12 API 에러 코드 사전 계약(확정)
- 실패 응답 공통 포맷은 `ok=false`, `error.code`, `error.message`, `error.details?`, `error.retryable`, `error.requestId?`로 고정한다.
- 에러 분기 기준은 `HTTP 상태코드 + error.code` 조합으로 고정하고, `message` 문자열은 UI 표시용으로만 사용한다.
- 기본 매핑은 다음으로 고정한다: `400(VALIDATION_ERROR/INVALID_ID_FORMAT/MISSING_REQUIRED_FIELD)`, `404(NOTE_NOT_FOUND)`, `409(CONFLICT)`, `413(FILE_TOO_LARGE)`, `415(UNSUPPORTED_MEDIA_TYPE)`, `500(INTERNAL_ERROR/FILE_SAVE_FAILED)`, `503(DB_UNAVAILABLE/MIGRATION_IN_PROGRESS)`.
- `error.retryable=true`인 코드만 재시도 UI를 노출한다(예: `DB_UNAVAILABLE`, 일부 `FILE_SAVE_FAILED`).
- 정의되지 않은 코드 수신 시 프론트는 `INTERNAL_ERROR`로 폴백 처리하고 공통 오류 화면/토스트를 표시한다.

### IC 결정 로그
- IC-01: API 스키마 기준선은 `../jwmemo` HEAD로 고정하고, 에러/상태 호환을 유지하되 비정상 입력은 권장형(`400/404/500`)으로 정규화한다.
- IC-02: 태그 검색은 대소문자 무시 + OR 매칭으로 고정한다.
- IC-03: 정렬은 `favorite/moddate/_id` 내림차순을 기본으로 하고, 페이지네이션은 `page/pageSize` 기반(기본 1/30, 최대 100)으로 고정한다.
- IC-04: 저장 실패 시 데이터 유실 없이 로컬 상태를 유지하고, `Cmd/Ctrl + S`/`:w`/재시도로 동일 경로 재시도하며 `:wq` 실패 시 종료하지 않는다.
- IC-05: `:wq`는 원본과 동일하게 저장 성공 시 view 화면으로 종료(수정은 `view/:id`, 신규는 `view/:newId`)하고, 실패 시 이동하지 않는다.
- IC-06: 저장 실패 시에는 경고만 표시하고 기본 동작은 이탈 취소로 고정해, 현재 편집 상태를 유지한 채 재시도 가능하게 한다.
- IC-07: 업로드는 `jpg/jpeg/png/gif/webp` + MIME 이중 검증, 파일당 10MB 제한, UUID 파일명 정책, SVG 비허용으로 고정한다.
- IC-08: orphan 이미지는 저장/삭제 시 즉시 정리하고, 실패분은 배치 정리(1일 1회)로 보강하며 최근 24시간 파일은 보호한다.
- IC-09: Preview 라인 매핑 실패 시 `이전 블록 -> 첫 블록 -> 동기화 생략` 순서로 fallback하고, 동일 블록 재정렬은 생략한다.
- IC-10: `migrate:reset`은 `--archive` 필수, `--yes` 확인 필수, `--dry-run` 지원, 단계별 종료코드(0/2/3/4/5/6) 규약으로 고정한다.
- IC-11: 릴리즈 수동 테스트 체크리스트는 `MANUAL_TEST_CHECKLIST.md`로 고정하고, 승인 기준은 치명/주요 결함 0건으로 확정한다.
- IC-12: API 에러 코드는 공통 스키마(`ok=false + error`)와 상태코드 매핑 사전으로 고정하고, 프론트 분기는 `status + code` 기준으로 통일한다.
