-- Echec contrôlé d'une transaction pour vérifier le rollback.
BEGIN;
UPDATE perf_accounts SET balance = balance - 100 WHERE id = 1;
SAVEPOINT before_failure;
DO $$ BEGIN
  INSERT INTO perf_accounts(id,balance) VALUES (1,100);
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Violation de cle unique attendue';
END $$;
ROLLBACK TO SAVEPOINT before_failure;
ROLLBACK;
