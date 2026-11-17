-- Synthetic data, not application tables. Call only against isolated DB.
CREATE TABLE IF NOT EXISTS perf_large (id bigint primary key, group_id integer not null, payload text not null);
TRUNCATE perf_large;
INSERT INTO perf_large SELECT n, (n % 1000), repeat('x', 100) FROM generate_series(1,100000) AS n;
ANALYZE perf_large;
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM perf_large WHERE group_id=42;
CREATE INDEX IF NOT EXISTS idx_perf_large_group_id ON perf_large(group_id);
ANALYZE perf_large;
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM perf_large WHERE group_id=42;
