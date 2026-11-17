#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
: "${POSTGRES_USER:?}"; : "${POSTGRES_DB:?}"
CID=$(docker compose -p kanso-perf -f performance/compose.perf.yml ps -q db)
[[ -n "$CID" ]] || { echo 'Start isolated perf stack first'; exit 1; }
mkdir -p performance/results
PSQL=(docker exec -i "$CID" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB")
"${PSQL[@]}" < performance/db/00_setup.sql
for script in 01_read 02_transfer 04_contention 05_isolation; do
  for clients in 1 10 50 100; do
    echo "=== $script / $clients concurrency / 1000 tx ==="
    docker cp "performance/db/${script}.sql" "$CID:/tmp/kanso_perf.sql"
    # Isolation may produce serialization errors, kept as observed outcome (nonzero allowed).
    set +e
    docker exec "$CID" pgbench -n -r -c "$clients" -j 4 -t "$((1000/clients))" -f /tmp/kanso_perf.sql -U "$POSTGRES_USER" "$POSTGRES_DB" 2>&1 | tee "performance/results/${script}_${clients}.log"
    code=${PIPESTATUS[0]}; set -e
    echo "exit_code=$code" >> "performance/results/${script}_${clients}.log"
  done
done
"${PSQL[@]}" < performance/db/03_failure_rollback.sql
"${PSQL[@]}" -c 'SELECT count(*) AS accounts, sum(balance) AS total, min(balance) AS min_balance FROM perf_accounts;'
"${PSQL[@]}" < performance/db/06_large_data.sql | tee performance/results/large_data.log
bash performance/db/deadlock_test.sh | tee performance/results/deadlock.log
