#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${POSTGRES_USER:?}"; : "${POSTGRES_DB:?}"
CID=$(docker compose -p kanso-perf -f performance/compose.perf.yml ps -q db)
[[ -n "$CID" ]] || { echo 'Perf DB not running'; exit 1; }
# Two psql sessions force opposite lock order with pg_sleep.
set +e
docker exec "$CID" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN; SET LOCAL lock_timeout='5s'; UPDATE perf_accounts SET balance=balance+1 WHERE id=1; SELECT pg_sleep(1); UPDATE perf_accounts SET balance=balance+1 WHERE id=2; COMMIT;" > /tmp/kanso_deadlock_a.log 2>&1 & A=$!
docker exec "$CID" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "BEGIN; SET LOCAL lock_timeout='5s'; UPDATE perf_accounts SET balance=balance+1 WHERE id=2; SELECT pg_sleep(1); UPDATE perf_accounts SET balance=balance+1 WHERE id=1; COMMIT;" > /tmp/kanso_deadlock_b.log 2>&1 & B=$!
wait "$A"; RA=$?; wait "$B"; RB=$?
set -e
cat /tmp/kanso_deadlock_a.log /tmp/kanso_deadlock_b.log
if [[ "$RA" -eq 0 && "$RB" -eq 0 ]]; then echo 'No deadlock observed - inconclusive'; exit 1; fi
if ! grep -q 'deadlock detected' /tmp/kanso_deadlock_{a,b}.log; then echo 'No confirmed deadlock'; exit 1; fi
echo 'PASS: PostgreSQL detected deadlock and aborted a transaction'
