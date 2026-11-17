#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f performance/.env.perf ]]; then
  echo 'Create performance/.env.perf from performance/.env.perf.example; use unique test credentials.' >&2; exit 1
fi
set -a; source performance/.env.perf; set +a
export POSTGRES_USER POSTGRES_DB
DC=(docker compose --env-file performance/.env.perf -p kanso-perf -f performance/compose.perf.yml)
case "${1:-help}" in
  up)
    "${DC[@]}" up -d --build
    "${DC[@]}" --profile tools run --rm migrate
    ;;
  db) bash performance/db/run_extended.sh ;;
  api)
    command -v k6 >/dev/null || { echo 'Install k6 first'; exit 1; }
    shift
    mode="${1:-root}"; shift || true
    mkdir -p performance/results
    k6 run --summary-export "performance/results/${mode}_$(date +%Y%m%d_%H%M%S).json" -e BASE_URL="http://localhost:${PERF_APP_PORT:-3301}" -e MODE="$mode" "$@" performance/api/scenarios.js
    ;;
  stats) "${DC[@]}" ps; docker stats --no-stream $("${DC[@]}" ps -q) ;;
  stop-db) "${DC[@]}" stop db ;;
  start-db) "${DC[@]}" start db ;;
  down) "${DC[@]}" down ;;
  reset-test-data)
    [[ "${CONFIRM_PERF_RESET:-}" == 'YES' ]] || { echo 'Set CONFIRM_PERF_RESET=YES to permanently delete isolated test volume'; exit 2; }
    "${DC[@]}" down -v
    ;;
  *) echo 'Usage: bash performance/run.sh {up|db|api MODE [k6 args]|stats|stop-db|start-db|down|reset-test-data}';;
esac
