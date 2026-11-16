#!/usr/bin/env python3
"""Set up a standalone Logics installation with Docker Compose."""
import argparse
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.logics-install"
GOOGLE_FIELDS = ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
PLACEHOLDER = "set-before-start"


def initialize():
    config = {
        "MYSQL_PASSWORD": secrets.token_hex(32),
        "MYSQL_ROOT_PASSWORD": secrets.token_hex(32),
        "NEXTAUTH_SECRET": secrets.token_hex(32),
        "USER_SETTINGS_ENCRYPTION_KEY": secrets.token_hex(32),
        "NEXTAUTH_URL": "http://localhost:3000",
        "INK_WEB_BIND": "127.0.0.1",
        "INK_WEB_PORT": "3000",
        "MYSQL_HOST_PORT": "3307",
        **dict.fromkeys(GOOGLE_FIELDS, PLACEHOLDER),
    }
    try:
        fd = os.open(ENV_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        print(f"Using existing configuration: {ENV_FILE.name}")
        return
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        for key, value in config.items():
            f.write(f"{key}={value}\n")
    print(f"Created {ENV_FILE.name}. Set Google OAuth credentials in that file.")


def compose(action):
    if not ENV_FILE.is_file():
        raise SystemExit("Run the init command first.")
    contents = ENV_FILE.read_text(encoding="utf-8")
    if action == "up":
        for field in GOOGLE_FIELDS:
            match = re.search(rf"^{field}=([^\r\n]*)", contents, re.MULTILINE)
            if not match or match[1].strip().strip("\"'") in ("", PLACEHOLDER):
                raise SystemExit(f"Set {field} in {ENV_FILE.name} before starting Logics.")
    if shutil.which("docker") is None:
        raise SystemExit("Install and start Docker with the Compose plugin, then retry.")
    env = os.environ.copy()
    for key in re.findall(r"^([A-Za-z_][A-Za-z0-9_]*)=", contents, re.MULTILINE):
        env.pop(key, None)
    env["INK_ENV_FILE"] = ENV_FILE.name
    command = [
        "docker", "compose", "--project-name", "logics-install",
        "--env-file", ENV_FILE.name, "-f", "docker-compose.pi.yml",
    ]
    args = (["up", "-d", "--build", "--wait", "--wait-timeout", "180", "mysql", "web"]
            if action == "up" else ["ps", "mysql", "web"])
    subprocess.run(command + args, cwd=ROOT, env=env, check=True)
    if action == "up":
        print("Logics containers are up. Open the address set in NEXTAUTH_URL.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("init", "up", "status"))
    action = parser.parse_args().action
    if action == "init":
        initialize()
    else:
        try:
            compose(action)
        except subprocess.CalledProcessError as error:
            raise SystemExit(error.returncode) from None


if __name__ == "__main__":
    main()
