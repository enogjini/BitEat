-- 0002 — audit trail for scanned order slips.
--
-- Safe to run more than once. Apply to every BitEat database (local
-- `restaurant`, then prod) before deploying the API version that adds
-- POST /api/tavolinat/:id/skano-faturen:
--
--   psql "$DATABASE_URL" -f db/migrations/0002_invoice_scans.sql
--
-- Background. The invoice-scan feature photographs a table's paper order
-- slip, OCRs it, and automatically merges or creates the matching order —
-- there is no confirmation screen. `skanimet_faturave` is the safety net for
-- going fully automatic: every scan records the raw OCR text plus what did
-- and did not get matched, so a misread is traceable after the fact even
-- though nothing blocked it in the moment.

BEGIN;

CREATE TABLE IF NOT EXISTS skanimet_faturave (
  skanim_id             SERIAL PRIMARY KEY,
  tavoline_id           INTEGER NOT NULL REFERENCES tavolinat(tavoline_id),
  porosi_id             INTEGER REFERENCES porosite(porosi_id),
  punonjes_id           INTEGER REFERENCES punonjesit(punonjes_id),
  teksti_ocr            TEXT NOT NULL,
  artikujt_gjetur       JSONB NOT NULL DEFAULT '[]',
  rreshta_pa_perputhje  JSONB NOT NULL DEFAULT '[]',
  krijuar_me            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS skanimet_faturave_tavoline_id_idx ON skanimet_faturave (tavoline_id);
CREATE INDEX IF NOT EXISTS skanimet_faturave_porosi_id_idx ON skanimet_faturave (porosi_id);

COMMIT;
