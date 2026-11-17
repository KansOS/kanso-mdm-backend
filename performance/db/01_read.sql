\set id random(1,1000)
SELECT balance FROM perf_accounts WHERE id = :id;
