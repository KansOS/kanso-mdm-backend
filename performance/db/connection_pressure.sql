-- Observe PostgreSQL connection states and limits while k6/pgbench runs.
SELECT current_setting('max_connections') AS max_connections;
SELECT state, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY state;
SELECT wait_event_type, wait_event, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2 ORDER BY 3 DESC;
