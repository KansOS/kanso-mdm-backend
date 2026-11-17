#!/usr/bin/env bash
set -euo pipefail
# Exécuter depuis la racine du backend, avec le docker-compose de dev actif.
# Exemple : PERF_DIR=/chemin/kanso-performance-tests ./.../db/run_db.sh
PERF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${POSTGRES_USER:?Exporter POSTGRES_USER depuis la configuration de TEST}"
: "${POSTGRES_DB:?Exporter POSTGRES_DB depuis la configuration de TEST}"
DB_CID="$(docker compose ps -q db)"
if [[ -z "$DB_CID" ]]; then echo 'Conteneur db introuvable'; exit 1; fi
mkdir -p "$PERF_DIR/results"
echo 'Initialisation de la table de test...'
docker exec -i "$DB_CID" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$PERF_DIR/db/00_setup.sql"
echo 'Etat initial (somme = 1000000000) :'
docker exec -i "$DB_CID" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SELECT COUNT(*) AS accounts, SUM(balance) AS total FROM perf_accounts;'
for mode in read transfer; do
  if [[ "$mode" == read ]]; then script=01_read.sql; else script=02_transfer.sql; fi
  for clients in 1 10 50 100; do
    echo "=== $mode : 1000 transactions / $clients clients ==="
    docker cp "$PERF_DIR/db/$script" "$DB_CID:/tmp/perf_benchmark.sql"
    docker exec "$DB_CID" pgbench -n -r -c "$clients" -j "$(($clients < 4 ? $clients : 4))" -t "$((1000 / clients))" -f /tmp/perf_benchmark.sql -U "$POSTGRES_USER" "$POSTGRES_DB" \
      | tee "$PERF_DIR/results/db_${mode}_${clients}.txt"
  done
done
echo 'Rollback intentionnel...'
docker exec -i "$DB_CID" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$PERF_DIR/db/03_failure_rollback.sql"
echo 'Verification : comptes=1000, somme=1000000000, aucun solde negatif :'
docker exec -i "$DB_CID" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SELECT COUNT(*) AS accounts, SUM(balance) AS total, MIN(balance) AS min_balance FROM perf_accounts;'
