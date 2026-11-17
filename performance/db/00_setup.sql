-- A EXECUTER UNIQUEMENT SUR UNE BASE DE TEST. Table isolée.
CREATE TABLE IF NOT EXISTS perf_accounts (
  id integer PRIMARY KEY,
  balance bigint NOT NULL CHECK (balance >= 0)
);
TRUNCATE TABLE perf_accounts;
INSERT INTO perf_accounts(id, balance)
SELECT i, 1000000 FROM generate_series(1, 1000) AS i;
