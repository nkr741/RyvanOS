#!/bin/sh
# PostgreSQL backup script - runs daily via cron inside the backup container.
# Keeps last 30 days of backups.

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/cortex_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup..."

pg_dump -h "${PGHOST:-postgres}" -U "${PGUSER:-cortex}" -d "${PGDATABASE:-cortex}" \
  --no-owner --no-privileges | gzip > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
  SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "[$(date)] Backup complete: ${BACKUP_FILE} (${SIZE})"
else
  echo "[$(date)] ERROR: Backup failed"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Remove backups older than 30 days
find "${BACKUP_DIR}" -name "cortex_*.sql.gz" -mtime +30 -delete
echo "[$(date)] Cleaned backups older than 30 days"
