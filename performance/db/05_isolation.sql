-- PostgreSQL SERIALIZABLE: observe rollback/serialization with concurrent clients
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT balance FROM perf_accounts WHERE id=1;
UPDATE perf_accounts SET balance=balance+1 WHERE id=1;
UPDATE perf_accounts SET balance=balance-1 WHERE id=1;
COMMIT;
