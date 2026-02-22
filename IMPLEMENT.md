# IMPLEMENT

## 1. 목적
이 문서는 `DESIGN.md`와 `REQUIREMENTS.md`를 실제 구현 단계로 분해한 실행 계획이다.  
진행 중단 후에도 다른 에이전트가 바로 이어서 작업할 수 있도록, 모든 작업을 Phase/체크리스트 단위로 관리한다.

## 2. 운영 규칙
- 상태 관리는 이 문서의 체크박스만 기준으로 한다.
- 작업 중단 시 `진행 로그`에 마지막 완료 항목, 이슈, 다음 시작 지점을 남긴다.
- 각 Phase는 `구현 체크리스트`와 `기본 테스트 코드`를 모두 완료해야 닫는다.
- 배포 승인 기준은 `MANUAL_TEST_CHECKLIST.md` PASS + Phase 8 완료다.

## 3. Phase 진행 보드
- [x] Phase 0. 기반 정리 및 작업 프레임
- [x] Phase 1. Atlas 1차 마이그레이션 + reset 자동화
- [x] Phase 2. `/jnote` 백엔드 호환 구현
- [x] Phase 3. Lithent 프런트 기본 화면 구현
- [ ] Phase 4. Monaco + monaco-vim + Preview 동기화
- [x] Phase 5. 운영 보강(로그/헬스체크/orphan 배치)
- [x] Phase 6. 테스트 강화 Phase(세부/경계 케이스)
- [x] Phase 7. 통합 테스트 Phase(Phase 간 연동 검증)
- [ ] Phase 8. 배포 직전 2차 마이그레이션 + 컷오버
- [ ] Phase 9. 레거시 UX 패리티(분리 스크롤/커맨드 푸터/Tailwind 스타일)
- [x] Phase 10. 최소 인증 도입(쓰기/수정 권한 보호)

## 4. Phase 상세

### Phase 0. 기반 정리 및 작업 프레임
#### 구현 체크리스트
- [x] `src/`, `server/`, `tests/` 기본 디렉터리 생성
- [x] `package.json` 스크립트에 서버 실행/테스트 기본 명령 추가
- [x] `.env.example`에 필수 키 목록 확정 (`MONGODB_URI`, `PORT`, `UPLOAD_DIR`, `LOG_LEVEL`)
- [x] `MANUAL_TEST_CHECKLIST.md`와 본 문서 참조 링크를 `README` 또는 루트 문서에 추가

#### 기본 테스트 코드
- [x] 환경 변수 유효성 검사 유닛 테스트 추가
- [x] 서버 부팅 스모크 테스트(프로세스 기동/종료) 추가

#### 완료 기준
- [x] 새 에이전트가 `pnpm install` 후 기본 테스트 1회 실행 가능

### Phase 1. Atlas 1차 마이그레이션 + reset 자동화
#### 구현 체크리스트
- [x] `scripts/migrate-reset.mjs` 구현 (`IC-10` 계약 준수)
- [x] 인자 계약 구현: `--archive`, `--db`, `--uri`, `--yes`, `--dry-run`
- [x] 종료코드 계약 구현: `0/2/3/4/5/6`
- [x] `mongo-all.archive` 기준 1차 복원 실행(개발 시작 기준 데이터)
- [x] 결과 요약 로그(`RESULT`, `EXIT_CODE`, `DB`, `ARCHIVE`) 출력

#### 기본 테스트 코드
- [x] 인자 파싱 유닛 테스트 추가
- [x] `--dry-run` 동작 테스트 추가
- [x] 실패 코드 매핑 테스트(연결 실패/복원 실패) 추가

#### 완료 기준
- [x] 동일 명령으로 재실행해도 절차가 재현 가능

### Phase 2. `/jnote` 백엔드 호환 구현
#### 구현 체크리스트
- [x] Express 앱/라우터 골격 구성 (`/jnote/*`, `/health/live`, `/health/ready`)
- [x] Mongoose 모델 구현(`Jmemo`, `Category`)
- [x] 엔드포인트 구현: `create/read/read/:id/update/delete/upload`
- [x] 태그 검색 규칙 구현(`case-insensitive + OR`, `IC-02`)
- [x] 정렬/페이지네이션 규칙 구현(`IC-03`)
- [x] 에러 코드 사전 적용(`IC-12`) + 공통 에러 응답 포맷 적용
- [x] 업로드 정책 반영(`IC-07`, 로컬 `images/YYYYMMDD/<uuid>.<ext>`)

#### 기본 테스트 코드
- [x] CRUD 성공 경로 API 테스트 추가
- [x] 잘못된 입력/없는 리소스 API 테스트(`400/404`) 추가
- [x] 업로드 제한 테스트(형식/용량) 추가

#### 완료 기준
- [x] 원본 `jwmemo` 기준 주요 요청/응답이 기능적으로 호환

### Phase 3. Lithent 프런트 기본 화면 구현
#### 구현 체크리스트
- [x] Lithent 기반 앱 부트스트랩 구성
- [x] 목록/상세/작성(수정 포함) 화면 구현
- [x] 노트 CRUD + 태그 검색 UI 연결
- [x] API 클라이언트 경계 단일화(`features/notes/api`)
- [x] 저장 실패/미저장 경고 UX 적용(`IC-04`, `IC-06`)

#### 기본 테스트 코드
- [x] 목록/상세/작성 화면 렌더 스모크 테스트 추가
- [x] 태그 검색 UI 동작 테스트 추가
- [x] 저장 실패 시 편집 버퍼 유지 테스트 추가

#### 완료 기준
- [x] 에디터 제외 핵심 기능(노트+태그)이 UI에서 동작

### Phase 4. Monaco + monaco-vim + Preview 동기화
#### 구현 체크리스트
- [x] Monaco 에디터 마운트 + monaco-vim 연결
- [x] Vim `:w`, `:wq` 저장/종료 계약 반영(`IC-05`, `DC-13`)
- [x] Preview 라인 매핑 구현(`start/end` 블록 매핑, `IC-09`)
- [x] 스크롤 동기화 제어 구현(`rAF`, 동일 라인 skip, 수동 스크롤 cooldown, `DC-11`)
- [x] 드래그 이미지 업로드 후 Markdown 자동 삽입 구현

#### 기본 테스트 코드
- [x] 라인->블록 매핑 유닛 테스트 추가
- [x] `:w`/`:wq` 명령 핸들러 테스트 추가
- [x] 이미지 드롭 업로드 플로우 테스트 추가

#### 완료 기준
- [ ] 커서 기반 Preview 동기화와 Vim 저장 플로우가 수동 검증에서 일관 동작

### Phase 5. 운영 보강(로그/헬스체크/orphan 배치)
#### 구현 체크리스트
- [x] 구조화 로그 필드 고정(`time`, `level`, `requestId`, `route`, `status`, `latencyMs`)
- [x] 민감정보 마스킹 처리(`MONGODB_URI`, 토큰, 쿠키)
- [x] `/health/live`, `/health/ready` 정책 반영(ready 실패 시 `503`)
- [x] orphan 이미지 배치 정리 작업 구현(1일 1회, 24시간 보호)

#### 기본 테스트 코드
- [x] `ready` 성공/실패 상태 테스트 추가
- [x] orphan 후보 판정 로직 테스트 추가
- [x] 민감정보 마스킹 유틸 테스트 추가

#### 완료 기준
- [x] 운영 점검 관점에서 장애 감지와 로그 추적 가능

### Phase 6. 테스트 강화 Phase(세부/경계 케이스)
#### 구현 체크리스트
- [x] API 경계값/예외 케이스 확장 테스트 추가(`IC-12` 코드별)
- [x] 저장 실패/재시도/이탈 경고 UX 경계 테스트 확장
- [x] Preview 동기화 대용량 문서 케이스 테스트 추가
- [x] 마이그레이션 스크립트 종료코드 전수 테스트 추가
- [x] 테스트 실행 리포트 포맷 통일(JUnit 또는 텍스트 요약)

#### 기본 테스트 코드
- [x] 백엔드 테스트에 오류 코드 snapshot/fixture 추가
- [x] 프런트 테스트에 상태 전이 케이스(`dirty -> save-fail -> retry`) 추가
- [x] 스크립트 테스트에 실패 주입(mock) 케이스 추가

#### 완료 기준
- [x] 핵심 모듈의 회귀 위험이 수치/리포트로 확인 가능

### Phase 7. 통합 테스트 Phase(Phase 간 연동 검증)
#### 구현 체크리스트
- [x] 로컬 통합 실행 시나리오 정의(마이그레이션 -> 서버 -> 프런트)
- [x] E2E 도구 선정 및 기본 설정(권장: Playwright)
- [x] 통합 시나리오 1: 노트 생성/수정 + `:wq` + 상세 복귀
- [x] 통합 시나리오 2: 태그 OR 검색 + 정렬/페이지네이션
- [x] 통합 시나리오 3: 이미지 업로드 + 노트 삭제 + orphan 정리
- [x] 통합 시나리오 4: `migrate:reset` 후 앱 스모크

#### 기본 테스트 코드
- [x] E2E 최소 4개 시나리오 테스트 코드 추가
- [x] API+DB 연동 스모크 테스트 스크립트 추가

#### 완료 기준
- [x] 주요 기능이 단일 모듈 테스트가 아닌 실제 연동 경로로 검증됨

### Phase 8. 배포 직전 2차 마이그레이션 + 컷오버
#### 구현 체크리스트
- [ ] 원본 `../jwmemo`에서 최신 dump/archive 재생성
- [ ] Atlas 대상 DB drop 후 전체 재복원(2차 마이그레이션)
- [ ] `MANUAL_TEST_CHECKLIST.md` 전체 수행 및 결과 기록
- [ ] 운영 환경 변수 최종 점검(`MONGODB_URI`, 업로드 경로)
- [ ] 배포 후 `live/ready` 확인 + 핵심 스모크(목록/상세/저장/검색)

#### 기본 테스트 코드
- [x] 배포 직전 스모크 실행 스크립트 추가
- [x] 컷오버 검증용 데이터 건수 체크 스크립트 추가

#### 완료 기준
- [ ] 2차 마이그레이션 성공 + 수동 체크리스트 PASS + 운영 스모크 PASS

### Phase 9. 레거시 UX 패리티(분리 스크롤/커맨드 푸터/Tailwind 스타일)
#### 구현 체크리스트
- [x] 레이아웃 스크롤 구조 분리: `body` 단일 스크롤 제거, 좌측 목록/우측 패널 독립 스크롤로 전환
- [x] 데스크톱 레이아웃 2단 고정: View/Write 모두 `좌측 목록 + 우측 작업영역` 구조 유지(가로 3단 분할 금지)
- [x] Write 모드 우측 작업영역 구성 고정: 에디터/프리뷰는 `상하 분할` 또는 `탭 전환`으로 처리해 가로 폭 축소 방지
- [x] 좌측 목록 커스텀 스크롤 UI 적용(레거시와 유사한 폭/색/hover 반응)
- [x] 우측 뷰어/에디터 커스텀 스크롤 UI 적용(패널별 일관 스타일)
- [x] 하단 고정 커맨드 푸터 추가(`position: sticky` 또는 `fixed`, `bottom: 0`) 및 모든 모드에서 가시성 유지
- [x] 글로벌 커맨드 푸터 명령창 추가: View/List/Write 전 모드에서 `:` 입력 가능, 현재 모드 상태 배지 표시
- [x] 공용 Ex 명령 디스패처 도입: `:e`, `:q`, `:w`, `:wq`를 단일 파서/핸들러에서 라우팅
- [x] 키 라우팅 우선순위 확정: 에디터 포커스 시 monaco-vim 우선, 비포커스/뷰어 모드 시 푸터 명령창 우선
- [x] View 모드 Vim Ex 명령 지원: `:e`(즉시 편집 진입), `:q`(목록 복귀/패널 닫기 정책 준수)
- [x] Write 모드 기존 `:w`, `:wq`와 푸터 커맨드 입력 상태 연동
- [x] Write 모드 Preview 하단 추적 모드 추가: 커서가 문서 끝 근처에서 연속 입력 시 Preview도 자동 하단 고정
- [x] Preview 하단 추적 해제/복귀 규칙 확정: 수동 스크롤 시 해제, 커서가 다시 문서 끝으로 오면 재활성화
- [x] Tailwind 도구체인 스캐폴딩 반영(`tailwindcss`, `@tailwindcss/postcss`, `postcss.config.cjs`, `tailwind.config.js`)
- [ ] Tailwind CSS 도입(`tailwindcss`, `postcss`, `autoprefixer`) 및 기존 주요 화면 스타일 이관
- [x] 전체 UI 다크모드 기본 테마 적용(라이트 우선이 아닌 다크 우선; 배경/텍스트/경계/포커스 컬러 토큰 재정의)
- [ ] Monaco/Preview/리스트/푸터 포함 전 영역 다크 테마 일관성 확보(컴포넌트별 톤 불일치 제거)
- [ ] 마크다운 뷰어 타이포그래피 재정비(헤더/코드블록/인용/리스트를 레거시 품질 이상으로 개선)
- [ ] 모바일/좁은 해상도에서 분리 스크롤 + 고정 푸터 동작 점검

#### 기본 테스트 코드
- [ ] UI 테스트: 좌/우 패널 스크롤 독립 동작 검증(`scrollTop` 상호 비간섭)
- [ ] UI 테스트: Write 모드에서도 데스크톱 기준 2단 레이아웃 유지 검증(가로 3단 분할 미발생)
- [ ] UI 테스트: 커맨드 푸터 항상 하단 고정 렌더링 검증(모드 전환 포함)
- [x] UI 테스트: View/List 모드에서 `:` 입력 시 푸터 명령창 활성화 및 `:e` 실행으로 Write 진입 검증
- [x] 유닛 테스트: 공용 Ex 명령 디스패처(`:e/:q/:w/:wq`) 파싱/라우팅 검증
- [ ] 유닛 테스트: 에디터 포커스 여부에 따른 키 라우팅 우선순위 검증
- [x] 명령 테스트: View 모드 `:e`, `:q` 파싱/라우팅 유닛 테스트 추가
- [x] 회귀 테스트: Write 모드 `:w`, `:wq` 동작 유지 확인
- [x] UI 테스트: 문서 하단 연속 입력 시 Preview 하단 자동 추적 동작 검증(수동 스크롤 해제 포함)
- [ ] 스모크 테스트: Tailwind 클래스 기반 레이아웃/뷰어 스타일 핵심 요소 렌더 확인
- [ ] 스모크 테스트: 다크모드 테마 클래스/토큰 적용 및 주요 화면 대비(가독성) 검증

#### 완료 기준
- [ ] 레거시 대비 UX 불편 포인트(통합 스크롤, 푸터 부재, View 모드 Ex 명령 미지원)가 모두 해소됨
- [ ] View/Write 공통으로 데스크톱 2단 레이아웃이 유지되어 가독성/입력 폭 저하가 없음
- [ ] 분리 스크롤 + 하단 커맨드 푸터 + Ex 명령 세트(`:e/:q/:w/:wq`)가 수동 테스트에서 일관 동작
- [ ] 전체 기본 테마가 다크모드로 적용되고, 본문/코드/링크/상태 메시지의 대비가 사용 가능한 수준으로 유지됨
- [ ] Tailwind 전환 후에도 기존 기능 회귀 없이 테스트 통과

### Phase 10. 최소 인증 도입(쓰기/수정 권한 보호)
#### 구현 체크리스트
- [x] 인증 정책 고정: `읽기(목록/상세)`는 익명 허용, `쓰기/수정/삭제/업로드`는 인증 필수
- [x] 단일 사용자용 간단 로그인 구현(비밀번호 기반) + 환경변수 키 확정(`AUTH_PASSWORD` 또는 동등 키)
- [x] 인증 세션 저장 방식 확정(권장: `httpOnly` 쿠키 기반 세션 토큰)
- [x] 인증 API 추가: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- [x] `/jnote/create|update|delete|upload`에 인증 미들웨어 적용(미인증 시 `401`)
- [x] 프런트 로그인 UI 추가(최소 입력 폼 + 로그인 상태 표시 + 로그아웃 버튼)
- [x] 미인증 상태에서 `New/Edit/Save/Delete/Upload` 및 Vim `:w/:wq/:e` 실행 시 인증 유도 UX 적용
- [x] 인증 실패/세션 만료 UX 확정(현재 편집 버퍼 보존 + 재로그인 후 재시도)
- [x] `.env.example`/문서에 인증 관련 설정값 및 운영 주의사항 반영

#### 기본 테스트 코드
- [x] API 테스트: 미인증 쓰기 요청 `401` 응답 검증
- [x] API 테스트: 로그인 성공 후 쓰기 요청 허용 검증
- [x] API 테스트: 잘못된 비밀번호/만료 세션/로그아웃 후 재요청 검증
- [x] UI 테스트: 미인증 상태에서 수정 진입 차단 및 로그인 유도 검증
- [x] UI 테스트: 로그인 후 `:w/:wq` 및 저장/삭제 버튼 정상 동작 검증

#### 완료 기준
- [x] 미인증 사용자는 읽기만 가능하고, 데이터 변경 동작은 모두 인증 후에만 수행됨
- [x] 로그인/로그아웃/세션만료 경로에서 데이터 유실 없이 UX가 일관 동작
- [x] 기존 핵심 기능 회귀 없이 테스트 통과

## 5. 중단/재개 체크리스트
- [x] 마지막 완료 체크박스 위치를 이 문서에 반영
- [x] 실패/보류 항목에 원인 1줄 기록
- [x] 다음 시작 명령 1개 기록
- [x] 관련 커밋 SHA 기록

## 6. 진행 로그(append-only)
- [ ] `YYYY-MM-DD HH:mm UTC | Phase-X | done: ... | next: ... | commit: ...`
- [x] `2026-02-21 17:15 UTC | Phase-0 | done: env module + server bootstrap + unit/smoke tests + README links | next: Phase-1 migrate-reset script scaffolding | commit: (working tree, not committed yet)`
- [x] `2026-02-21 17:17 UTC | Phase-1(partial) | done: migrate-reset script + exit-code contract + dry-run/arg/failure tests | next: run real 1st Atlas restore with --yes when approved | commit: (working tree, not committed yet)`
- [x] `2026-02-21 17:37 UTC | Phase-1 complete | done: user executed real migrate-reset success after mongorestore install + fallback support landed | next: Phase-2 backend compatibility implementation | commit: (working tree, not committed yet)`
- [x] `2026-02-21 17:37 UTC | Phase-2 complete | done: Express/Mongoose jnote API + IC-12 error contract + upload limits + smoke tests | next: Phase-3 Lithent frontend base | commit: (working tree, not committed yet)`
- [x] `2026-02-21 17:45 UTC | Phase-3 complete | done: Lithent app scaffold + note list/view/write + search + unsaved warning + frontend smoke/behavior tests | next: Phase-4 Monaco + Vim editor integration | commit: (working tree, not committed yet)`
- [x] `2026-02-21 17:55 UTC | Phase-4(partial) | done: monaco-vim dynamic mount + :w/:wq command binding + drop-upload markdown insertion + unit/smoke tests | next: manual browser validation then Phase-5 ops hardening | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:15 UTC | Phase-5 complete | done: safe log masking + orphan image batch cleaner(24h guard, daily scheduler) + unit tests | next: Phase-6 test hardening (error-code matrix / state transitions) | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:16 UTC | Phase-6(partial) | done: API error-code edge tests + save-fail->retry UI state-transition test | next: preview large-doc sync tests + backend error fixtures/snapshots | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:17 UTC | Phase-6(partial) | done: preview large-doc line-map test + error-code fixture wiring | next: test report format standardization (JUnit/text summary) | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:18 UTC | Phase-6 complete | done: junit report script(test:report) + fixture/state/edge coverage aligned | next: Phase-7 integration test scaffolding | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:20 UTC | Phase-7(partial) | done: Playwright config + 4 API integration scenarios + integration-smoke script | next: run E2E against live local server and close Phase-7 | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:32 UTC | Phase-7/8(partial) | done: memory-service mode for local integration + release-smoke/release-count scripts + unit coverage | next: run test:e2e on non-sandbox host and close Phase-7 completion gate | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:41 UTC | Phase-7 complete + Phase-8(partial) | done: notesApi<->express integration test + cutover pipeline script(cutover:run) + unit tests | next: execute real Phase-8 on Atlas with latest archive | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:43 UTC | docs/runbook update | done: CUTOVER_RUNBOOK.md + restart checklist sync | next: run pnpm run cutover:run -- --archive ./mongo-all.archive --yes on real Atlas env | commit: dfb7aa0`
- [x] `2026-02-21 18:44 UTC | Phase-8 rehearsal | done: cutover pipeline dry-run success with local .env archive | next: execute real cutover with --yes on production network | commit: (working tree, not committed yet)`
- [x] `2026-02-21 18:56 UTC | backlog update | done: added Phase-9 checklist for split-scroll, command footer, view-mode :e/:q, tailwind restyle | next: implement Phase-9 items in small PR units | commit: (working tree, not committed yet)`
- [x] `2026-02-21 19:02 UTC | backlog update | done: added Phase-10 checklist for legacy-like simple auth (write-protected mode) | next: finalize auth policy/session mechanism before implementation | commit: (working tree, not committed yet)`
- [x] `2026-02-22 06:30 UTC | Phase-9(partial) | done: 2-column fixed shell + split scroll + global command footer + Ex dispatcher(:e/:q/:w/:wq) + unit/smoke tests | next: preview bottom-follow + dark mode/tailwind migration + auth phase start | commit: (working tree, not committed yet)`
- [x] `2026-02-22 06:34 UTC | Phase-9(partial) | done: preview bottom-follow(sync-to-end) + manual-scroll cooldown release + smoke test coverage | next: dark mode baseline + tailwind migration scaffolding | commit: (working tree, not committed yet)`
- [x] `2026-02-22 06:38 UTC | Phase-9(partial) | done: dark-mode baseline theme(shell/panels/inputs/footer + monaco vs-dark) + render smoke assertions | next: tailwind migration plan + color/contrast tuning pass | commit: (working tree, not committed yet)`
- [x] `2026-02-22 06:40 UTC | Phase-9(partial) | done: tailwind toolchain scaffolding(deps + postcss + config + css import) | next: replace legacy CSS blocks with tailwind utility/components incrementally | commit: (working tree, not committed yet)`
- [x] `2026-02-22 06:48 UTC | Phase-10(partial) | done: auth service(app/routes/env) + read-only anon policy + write-route middleware + auth UI + API/unit tests | next: session-expiry UX + authenticated :w/:wq/save/delete UI regression coverage | commit: (working tree, not committed yet)`
- [x] `2026-02-22 06:49 UTC | Phase-10 complete | done: 401 session-expiry handling(draft preserve + re-login retry) + :w stays write / :wq closes + auth UI/API regression tests | next: close remaining Phase-9 style/test parity items | commit: (working tree, not committed yet)`
