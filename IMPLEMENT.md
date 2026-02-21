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
- [ ] Phase 6. 테스트 강화 Phase(세부/경계 케이스)
- [ ] Phase 7. 통합 테스트 Phase(Phase 간 연동 검증)
- [ ] Phase 8. 배포 직전 2차 마이그레이션 + 컷오버

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
- [ ] 테스트 실행 리포트 포맷 통일(JUnit 또는 텍스트 요약)

#### 기본 테스트 코드
- [x] 백엔드 테스트에 오류 코드 snapshot/fixture 추가
- [x] 프런트 테스트에 상태 전이 케이스(`dirty -> save-fail -> retry`) 추가
- [x] 스크립트 테스트에 실패 주입(mock) 케이스 추가

#### 완료 기준
- [ ] 핵심 모듈의 회귀 위험이 수치/리포트로 확인 가능

### Phase 7. 통합 테스트 Phase(Phase 간 연동 검증)
#### 구현 체크리스트
- [ ] 로컬 통합 실행 시나리오 정의(마이그레이션 -> 서버 -> 프런트)
- [ ] E2E 도구 선정 및 기본 설정(권장: Playwright)
- [ ] 통합 시나리오 1: 노트 생성/수정 + `:wq` + 상세 복귀
- [ ] 통합 시나리오 2: 태그 OR 검색 + 정렬/페이지네이션
- [ ] 통합 시나리오 3: 이미지 업로드 + 노트 삭제 + orphan 정리
- [ ] 통합 시나리오 4: `migrate:reset` 후 앱 스모크

#### 기본 테스트 코드
- [ ] E2E 최소 4개 시나리오 테스트 코드 추가
- [ ] API+DB 연동 스모크 테스트 스크립트 추가

#### 완료 기준
- [ ] 주요 기능이 단일 모듈 테스트가 아닌 실제 연동 경로로 검증됨

### Phase 8. 배포 직전 2차 마이그레이션 + 컷오버
#### 구현 체크리스트
- [ ] 원본 `../jwmemo`에서 최신 dump/archive 재생성
- [ ] Atlas 대상 DB drop 후 전체 재복원(2차 마이그레이션)
- [ ] `MANUAL_TEST_CHECKLIST.md` 전체 수행 및 결과 기록
- [ ] 운영 환경 변수 최종 점검(`MONGODB_URI`, 업로드 경로)
- [ ] 배포 후 `live/ready` 확인 + 핵심 스모크(목록/상세/저장/검색)

#### 기본 테스트 코드
- [ ] 배포 직전 스모크 실행 스크립트 추가
- [ ] 컷오버 검증용 데이터 건수 체크 스크립트 추가

#### 완료 기준
- [ ] 2차 마이그레이션 성공 + 수동 체크리스트 PASS + 운영 스모크 PASS

## 5. 중단/재개 체크리스트
- [ ] 마지막 완료 체크박스 위치를 이 문서에 반영
- [ ] 실패/보류 항목에 원인 1줄 기록
- [ ] 다음 시작 명령 1개 기록
- [ ] 관련 커밋 SHA 기록

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
