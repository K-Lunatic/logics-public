# Logics · INK

일정·식단·물품 등 흩어진 기록을 한곳에 모으고, 웹 화면이나 채팅에서 조회하거나 수정하는 개인 도구입니다.

## 새 환경에 설치

macOS와 Windows에서는 Docker Desktop을 먼저 실행합니다. Windows는 WSL 2 기반 Linux 컨테이너를 사용합니다. Raspberry Pi는 64비트 OS와 Docker Engine 및 Compose 플러그인이 필요합니다. 세 환경 모두 Python 3을 사용합니다.

```sh
git clone https://github.com/K-Lunatic/logics-public.git
cd logics-public
python3 scripts/install-logics.py init
```

Windows PowerShell에서는 `python3` 대신 `py -3`을 사용합니다. `.env.logics-install`에 Google OAuth 웹 클라이언트의 `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET`을 입력합니다. 기본 콜백 주소는 `http://localhost:3000/api/auth/callback/google`입니다. MySQL 비밀번호와 앱 내부 키는 설치 프로그램이 생성합니다.

```sh
python3 scripts/install-logics.py up
python3 scripts/install-logics.py status
```

설치한 기기에서 `http://localhost:3000`을 엽니다. 별도 기기에서 접속하는 Pi 구성에는 아래 라즈베리파이 설치 안내를 참고합니다. 설치 프로그램을 다시 실행해도 설정 파일과 MySQL 볼륨은 유지됩니다. 설치를 안내하는 에이전트에는 [Logics 설치 스킬](skills/logics-install/SKILL.md)을 사용할 수 있습니다.

## 라즈베리파이에서 실행하는 구성

```mermaid
flowchart LR
    Browser["브라우저"] --> Web["Next.js 웹 앱"]
    Web --> MySQL["MySQL"]
    MySQL --> Volume["Docker 데이터 볼륨"]
```

웹과 MySQL은 Docker Compose에서 별도 서비스로 실행됩니다. 웹은 Docker 내부 네트워크로 MySQL에 연결합니다. 호스트에서 노출하는 MySQL 포트는 루프백에 바인딩됩니다. 2026년 11월 16일 개인 라즈베리파이에서 웹 HTTP 200과 두 서비스의 정상 상태를 확인했습니다.

**[라즈베리파이 설치 방법](docs/raspberry-pi-mysql.md)** · [코드 구성](ARCHITECTURE.md)

## 예제로 이해하기

재고 화면에 예제 품목 **현미 2봉**을 추가한 뒤 목록을 확인합니다. 1봉을 썼다면 수량을 **1봉**으로 수정하고 다시 조회합니다. 이 흐름에서 Next.js가 변경을 처리하고 MySQL에 상태를 저장합니다. AI 연결이 구성된 환경에서는 채팅으로 같은 재고 조회와 변경을 요청할 수 있습니다.

## 배포 자료

기상 격자 원본과 생성본 데이터는 포함하지 않습니다. 사용 권한이 있는 CSV로 generate:weather-grid를 실행하기 전까지 위치 기반 기상 조회는 비활성 범위입니다. 실사용 계정 및 DB 데이터를 복사하지 마세요.

[MIT 라이선스](LICENSE) · [외부 자료 안내](THIRD_PARTY_NOTICES.md)

[개발 기록](DEVELOPMENT.md)
