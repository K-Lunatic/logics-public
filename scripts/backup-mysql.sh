#!/usr/bin/env bash
set -euo pipefail

compose_file="${COMPOSE_FILE:-docker-compose.pi.yml}"
env_file="${ENV_FILE:-.env.pi}"
backup_dir="${BACKUP_DIR:-backups}"
timestamp="$(date '+%Y%m%d_%H%M%S')"

mkdir -p "$backup_dir"
docker compose --env-file "$env_file" -f "$compose_file" exec -T mysql \
  sh -c 'exec mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" ink' \
  | gzip > "$backup_dir/ink_$timestamp.sql.gz"

echo "$backup_dir/ink_$timestamp.sql.gz"
