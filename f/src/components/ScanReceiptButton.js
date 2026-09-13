import React, { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import api from '../services/api';

/**
 * Photograph a table's paper order slip and let the server OCR it and
 * automatically merge or create the matching order — there is no
 * confirmation step, so the result (what matched, what didn't) is always
 * shown right after the scan completes instead of before it's applied.
 *
 * @param {number}   tavolineId
 * @param {Function} onChanged   called after a scan that changed the order
 */
export default function ScanReceiptButton({ tavolineId, onChanged }) {
  const inputRef = useRef(null);
  const [duke, setDuke] = useState(false);
  const [rezultati, setRezultati] = useState(null);
  const [gabim, setGabim] = useState(null);

  const zgjidhFoto = () => inputRef.current?.click();

  const kurZgjidhet = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setDuke(true);
    setGabim(null);
    setRezultati(null);
    try {
      const form = new FormData();
      form.set('foto', file);
      const res = await api.upload(`/api/tavolinat/${tavolineId}/skano-faturen`, form);
      setRezultati(res);
      if (res.porosi_id) await onChanged();
    } catch (err) {
      console.error(err);
      setGabim(err.message || 'Gabim');
    } finally {
      setDuke(false);
    }
  };

  return (
    <div className="flex-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={kurZgjidhet}
        className="hidden"
        aria-label="Skano faturën"
      />
      <button
        onClick={zgjidhFoto}
        disabled={duke}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white p-3 rounded-xl font-black flex items-center justify-center gap-2"
      >
        {duke ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
        {duke ? 'DUKE SKANUAR…' : 'SKANO FATURËN'}
      </button>

      {gabim && (
        <p className="mt-2 text-sm font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-500/15 p-2 rounded-lg">{gabim}</p>
      )}

      {rezultati && (
        <div className="mt-2 text-sm bg-subtle p-2 rounded-lg">
          {rezultati.artikujt.length > 0 ? (
            <p className="font-bold text-green-700 dark:text-green-400">
              {rezultati.u_krijua ? 'U krijua porosi e re: ' : 'U shtuan në porosi: '}
              {rezultati.artikujt.map((a) => `${a.sasia}× ${a.emri}`).join(', ')}
            </p>
          ) : (
            <p className="font-bold text-ink-muted">Nuk u njoh asnjë artikull nga menyja.</p>
          )}
          {rezultati.tekst_pa_perputhje.length > 0 && (
            <p className="mt-1 text-ink-muted">
              Pa u njohur: {rezultati.tekst_pa_perputhje.map((r) => `"${r.rawLine}"`).join(', ')} — shtoji me dorë.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
