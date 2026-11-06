# Raspberry Pi + MySQL 이전

이 구성은 웹 앱과 MySQL을 Raspberry Pi에서 함께 실행한다. Firestore는
일회성 원본 이관에만 사용하고, 이관 이후 앱의 모든 읽기·쓰기는 MySQL로
향한다.

## Mac 로컬 검증

맥에서는 기존 프로젝트 `.env`를 사용해 MySQL을 먼저 실행한다. 기본 호스트
포트는 `3307`이며, 기존 로컬 MySQL의 `3306`과 충돌하지 않는다.

```bash
INK_ENV_FILE=.env docker compose --env-file .env -f docker-compose.pi.yml up -d mysql
INK_ENV_FILE=.env docker compose --env-file .env -f docker-compose.pi.yml up -d --build web
```

`http://localhost:3000`에서 확인한다. 같은 Compose 파일은 Raspberry Pi에서
기본적으로 `.env.pi`를 사용하므로 로컬 비밀번호가 Pi로 복사되지 않는다.

보존할 Firestore 데이터가 아직 있을 때만, MySQL 앱을 사용하기 전에 한 번
이관한다. 초기화됐거나 버릴 Firebase 프로젝트에는 이 명령을 실행하지 않는다.
`.env`에는 Firebase 서비스 계정의 `FIREBASE_CLIENT_EMAIL`과
`FIREBASE_PRIVATE_KEY`도 필요하다.

```bash
INK_ENV_FILE=.env docker compose --env-file .env -f docker-compose.pi.yml --profile migration run --rm migrate
```

## 준비

- Raspberry Pi OS 64-bit
- Raspberry Pi 5 권장
- 데이터 볼륨용 USB SSD 권장
- Docker Engine과 Docker Compose

SD 카드만 데이터베이스 저장소로 사용하지 않는다. 정전이나 디스크 고장에
대비해 별도 장치 또는 다른 서버로 백업 파일을 복사해야 한다.

## 1. 환경 설정

```bash
cp .env.pi.example .env.pi
```

`.env.pi`의 비밀번호와 OAuth·AI 키를 실제 값으로 바꾼다.
`USER_SETTINGS_ENCRYPTION_KEY`는 기존 Firebase에 저장된 개인 API 키를
복호화해야 하므로 기존 운영 값과 같아야 한다.

Google OAuth 콘솔의 승인된 리디렉션 URI도 새 주소에 맞춘다.

```text
http://raspberrypi.local:3000/api/auth/callback/google
```

외부 인터넷에서 사용할 경우 DB 포트는 공개하지 말고, 웹 3000 포트만
HTTPS 리버스 프록시 또는 VPN 뒤에 둔다.

## 2. MySQL 시작

```bash
docker compose --env-file .env.pi -f docker-compose.pi.yml up -d mysql
```

MySQL 포트는 Pi 자신의 `127.0.0.1`에만 연결된다. 웹 컨테이너는 내부 Docker
네트워크로 접속한다.

## 3. Firestore 쓰기 중단

정확한 스냅샷을 옮기려면 기존 배포를 먼저 중지하거나 읽기 전용으로
전환한다. 이관 도중 기존 앱에서 수정하면 이미 지나간 문서의 변경이 빠질
수 있다.

Firestore 일일 읽기 한도가 소진됐다면 한도가 초기화된 후 아래 작업을
한 번만 실행한다. 미리보기 실행도 동일하게 읽기 할당량을 쓰므로 제공하지
않는다.

## 4. 전체 데이터 이관

```bash
docker compose --env-file .env.pi -f docker-compose.pi.yml \
  --profile migration run --rm migrate
```

이관기는 다음을 수행한다.

- 루트부터 모든 하위 컬렉션을 재귀 탐색
- 모든 Firestore 문서 경로와 필드를 MySQL JSON으로 저장
- 저장 직후 문서별 원본/대상 값 검증
- 중단 시 `.migration/firestore-to-mysql.json`부터 재개
- 재실행해도 같은 경로를 덮어쓰는 멱등 처리

성공 출력의 `result`가 `success`인지 확인한다. 처음부터 다시 이관할
때만 기존 `.migration/firestore-to-mysql.json`을 별도 보관한 뒤 제거한다.

## 5. 웹 앱 시작

```bash
docker compose --env-file .env.pi -f docker-compose.pi.yml up -d --build web
docker compose --env-file .env.pi -f docker-compose.pi.yml ps
```

이후 `http://raspberrypi.local:3000`에서 확인한다. 최소한 다음 흐름을
실제로 확인한 뒤 기존 배포를 폐기한다.

1. 로그인 및 기존 프로필 확인
2. 물품·일정·재무·건강·식단 목록 확인
3. 각 도메인에서 하나씩 추가·수정·삭제
4. AI가 목록을 읽고 실제 수정 결과를 다시 조회하는지 확인
5. 공유 그룹과 자동화 API 확인

## 6. 백업

```bash
sh scripts/backup-mysql.sh
```

`backups/ink_YYYYMMDD_HHMMSS.sql.gz`가 생성된다. 이 파일을 Pi 외부 저장소로
복사한다. 매일 새벽 cron에서 실행하고, 복구 시험을 정기적으로 수행한다.

복구 예시:

```bash
gzip -dc backups/ink_YYYYMMDD_HHMMSS.sql.gz \
  | docker compose --env-file .env.pi -f docker-compose.pi.yml exec -T mysql \
    sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ink'
```

## 구조

애플리케이션의 기존 Firestore 경로를 `ink_documents.path`에 그대로
보관한다. 따라서 기능 코드는 유지하면서 저장 엔진만 MySQL로 교체된다.

- `path_hash`: 긴 경로를 안전하게 조회하는 SHA-256 기본 키
- `path`: 기존 Firestore 전체 문서 경로
- `collection_path`: 직접 자식 목록 조회용 경로
- `data`: 원본 필드 JSON
- `version`: 조건부 수정과 동시성 제어

개별 수정은 InnoDB 트랜잭션과 행 잠금으로 처리하며, 기존 Firestore의
읽기·쓰기 횟수 과금은 더 이상 발생하지 않는다.
