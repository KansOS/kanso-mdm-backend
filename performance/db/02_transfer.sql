-- Une transaction = deux débits/crédits atomiques, sans modification du total.
\set src random(1,500)
\set dst random(501,1000)
BEGIN;
UPDATE perf_accounts SET balance = balance - 1 WHERE id = :src;
UPDATE perf_accounts SET balance = balance + 1 WHERE id = :dst;
COMMIT;
