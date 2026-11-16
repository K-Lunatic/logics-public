---
name: logics-install
description: Set up a standalone Logics personal dashboard on macOS, Windows, or a 64-bit Raspberry Pi using Docker Compose. Use for first-time installation and checking the installation status.
---

# Logics 설치

1. 공식 공개 저장소 `https://github.com/K-Lunatic/logics-public`를 내려받고, 저장소 루트의 README에서 설치 조건과 명령을 확인한다.
2. Python 3과 Docker Compose가 동작하는지 확인한다. Windows는 WSL 2를 쓰는 Docker Desktop의 Linux 컨테이너 모드에서 실행한다. Raspberry Pi는 64비트 OS에서 Docker Engine을 실행한다.
3. 저장소 루트에서 `python3 scripts/install-logics.py init`을 실행한다. Windows에서는 `py -3`을 사용한다. 설치 설정 파일을 다시 만들기 위해 기존 파일을 지우지 않는다.
4. Google OAuth 클라이언트 ID와 시크릿은 사용자가 `.env.logics-install`에 직접 설정한다. 콜백 주소는 `NEXTAUTH_URL`에 `/api/auth/callback/google`을 붙인 값이다. 설정 파일의 내용을 출력하거나 시크릿을 채팅으로 요청하지 않는다.
5. 같은 스크립트의 `up`으로 설치하고 `status`로 웹과 MySQL을 확인한다. 브라우저에서 사이트가 열리는지와 Google 로그인 성공 여부는 구분해 보고한다.

설치용 Compose 프로젝트는 `logics-install`이며 기본 웹 주소는 `http://localhost:3000`이다. 사용 중인 운영 인스턴스의 데이터 이전은 별도 작업이다. 오류가 나면 Docker 실행 여부와 포트 충돌을 먼저 확인한다.
