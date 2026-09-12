-- 0001 — make drink stock tracking work.
--
-- Safe to run more than once. Apply to every BitEat database (local `restaurant`,
-- then the Supabase project) before deploying the API that decrements stock:
--
--   psql "$DATABASE_URL" -f db/migrations/0001_stock_tracking.sql
--
-- Background. `pije_inventar` used to be called `inventar_pijesh`, and two
-- triggers on `artikujt_porosise` still reference the old name (and columns
-- that never existed). The effect today is that INSERTing any drink line fails
-- with `relation "inventar_pijesh" does not exist` — drinks cannot be ordered
-- at all. This migration:
--
--   1. repairs the price-snapshot trigger so drink lines insert again;
--   2. drops the broken stock trigger — the API now decrements stock itself,
--      inside the order transaction, through `artikujt_menu.inventar_pije_id`
--      (which already exists and is already linked for every drink);
--   3. adds the guard rails the API relies on: stock and prices cannot go negative.

BEGIN;

-- 1. Keep the price snapshot on each order line; drop the write to the
--    non-existent `inventar_pijesh` (which also copied the *sale* price into
--    the *unit cost* column — wrong even when it worked).
CREATE OR REPLACE FUNCTION public.vendos_cmimin_artikullit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT cmimi INTO NEW.cmimi
  FROM artikujt_menu
  WHERE artikull_id = NEW.artikull_id;
  RETURN NEW;
END;
$function$;

-- 2. Stock is decremented by the API (one place, tested, names the drink in
--    the 409 it returns when stock runs out). Remove the trigger that meant to
--    do the same so nothing is decremented twice.
DROP TRIGGER IF EXISTS trg_update_drink_inventory ON artikujt_porosise;
DROP FUNCTION IF EXISTS public.update_drink_inventory_on_order();

-- 3. Guard rails. Both tables are clean today, so the constraints validate
--    immediately; if a later import leaves a negative row, VALIDATE will say so.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pije_inventar_stoku_jo_negativ') THEN
    ALTER TABLE pije_inventar
      ADD CONSTRAINT pije_inventar_stoku_jo_negativ CHECK (stoku_aktual >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artikujt_menu_cmimi_jo_negativ') THEN
    ALTER TABLE artikujt_menu
      ADD CONSTRAINT artikujt_menu_cmimi_jo_negativ CHECK (cmimi >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS artikujt_menu_inventar_pije_id_idx ON artikujt_menu (inventar_pije_id);

COMMIT;

-- Sanity check: every drink should have a stock line, food should not.
SELECT k.emri AS kategoria,
       COUNT(am.artikull_id)      AS artikuj,
       COUNT(am.inventar_pije_id) AS te_lidhur_me_stokun
FROM kategorite k
LEFT JOIN artikujt_menu am ON am.kategori_id = k.kategori_id
GROUP BY k.kategori_id, k.emri
ORDER BY k.kategori_id;
