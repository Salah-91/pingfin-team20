#!/usr/bin/env bash
# Dump beide PingFin databases naar SQL-files (schema + data)
# Voor de eindzip-deliverable.
#
# Gebruik:
#   bash scripts/dump-database.sh
# OF (PowerShell):
#   docker exec pingfin-team20-db-1 mysqldump --all-databases ... > dump.sql

set -euo pipefail

OUT_DIR="docs/sql-dump"
mkdir -p "$OUT_DIR"

# Detecteer container-naam (Docker compose v2 plurals)
CONTAINER=$(docker ps --filter "ancestor=mysql:8" --format "{{.Names}}" | head -1)
if [ -z "$CONTAINER" ]; then
  echo "❌ Geen MySQL-container draaiend. Run eerst: docker compose up -d"
  exit 1
fi
echo "→ Container: $CONTAINER"

PASS="${DB_PASS:-pingfin_dev_password}"

# Beide databases dumpen
for DB in pingfin_b1 pingfin_b2; do
  OUT="$OUT_DIR/${DB}_dump.sql"
  echo "→ Dumping $DB → $OUT"
  docker exec "$CONTAINER" mysqldump \
    -u root -p"$PASS" \
    --databases "$DB" \
    --add-drop-database \
    --single-transaction \
    --skip-lock-tables \
    > "$OUT" 2>/dev/null
  echo "  ✓ $(wc -l < "$OUT") lines"
done

# Combined dump
COMBINED="$OUT_DIR/pingfin_full_dump.sql"
echo "→ Combined dump → $COMBINED"
docker exec "$CONTAINER" mysqldump \
  -u root -p"$PASS" \
  --databases pingfin_b1 pingfin_b2 \
  --add-drop-database \
  --single-transaction \
  > "$COMBINED" 2>/dev/null
echo "  ✓ $(wc -l < "$COMBINED") lines"

echo ""
echo "✅ Dumps in $OUT_DIR/"
ls -la "$OUT_DIR/"
