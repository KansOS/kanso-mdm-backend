\set id 1
BEGIN;
UPDATE perf_accounts SET balance=balance+1 WHERE id=:id;
UPDATE perf_accounts SET balance=balance-1 WHERE id=:id;
COMMIT;
