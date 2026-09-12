import React, { useState } from 'react';
import { Clock, Minus, Plus, Trash2, X } from 'lucide-react';
import api from '../services/api';

const lek = (n) => `${Number(n || 0).toFixed(0)} L`;

/** "35 min", "2 h 10 min", "3 ditë" — how long ago the order was placed. */
export function qeNga(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} ditë`;
}

/**
 * One open order inside the table panel, with its lines editable in place:
 * quantity up/down, remove, and an "add item" picker. Every change is one
 * API call; the parent reloads the table afterwards via `onChanged`.
 *
 * @param {object}   porosi      { porosi_id, kamarier, punonjes_id, ora_porosise, artikujt, totali }
 * @param {object}   perdoruesi  the signed-in user (to mark "(ju)")
 * @param {Array}    menu        menu items, or null while loading
 * @param {Array}    kategorite  categories, or null while loading
 * @param {Function} onChanged   called after any successful change
 */
export default function OrderEditor({ porosi, perdoruesi, menu, kategorite, onChanged }) {
  const [duke, setDuke] = useState(false);
  const [gabim, setGabim] = useState(null);
  const [shtoHapur, setShtoHapur] = useState(false);
  const [kategori, setKategori] = useState('');
  const [artikull, setArtikull] = useState('');
  const [sasia, setSasia] = useState(1);

  const run = async (fn) => {
    setDuke(true);
    setGabim(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      console.error(err);
      setGabim(err.message || 'Gabim');
    } finally {
      setDuke(false);
    }
  };

  const ndryshoSasine = (a, e_re) => {
    if (e_re < 1) return;
    run(() => api.patch(`/api/porosite/${porosi.porosi_id}/artikujt/${a.artikull_porosie_id}`, { sasia: e_re }));
  };

  const hiq = (a) => {
    if (!window.confirm(`Hiq "${a.emri}" nga porosia #${porosi.porosi_id}?`)) return;
    run(() => api.delete(`/api/porosite/${porosi.porosi_id}/artikujt/${a.artikull_porosie_id}`));
  };

  const shto = () => {
    const id = parseInt(artikull, 10);
    const n = parseInt(sasia, 10);
    if (!id || !(n > 0)) return;
    run(async () => {
      await api.post(`/api/porosite/${porosi.porosi_id}/artikujt`, { artikujt: [{ artikull_id: id, sasia: n }] });
      setArtikull('');
      setSasia(1);
    });
  };

  const artikujtEFiltruar = (menu || []).filter((m) => !kategori || String(m.kategori_id) === kategori);

  return (
    <div className="p-4 bg-subtle rounded-xl">
      <div className="flex justify-between items-baseline mb-2">
        <p className="font-bold">
          Porosi #{porosi.porosi_id} · {porosi.kamarier}
          {porosi.punonjes_id === perdoruesi?.punonjes_id && <span className="text-ink-subtle"> (ju)</span>}
        </p>
        <p className="text-sm text-ink-muted"><Clock size={14} className="inline" /> {qeNga(porosi.ora_porosise)}</p>
      </div>

      {porosi.artikujt.map((a) => (
        <div key={a.artikull_porosie_id} className="flex items-center gap-2 text-sm py-1.5 border-t">
          <div className="flex items-center rounded-lg bg-muted">
            <button
              onClick={() => ndryshoSasine(a, a.sasia - 1)}
              disabled={duke || a.sasia <= 1}
              className="p-1.5 disabled:opacity-30"
              aria-label={`Pakëso ${a.emri}`}
            ><Minus size={14} /></button>
            <span className="w-7 text-center font-bold">{a.sasia}</span>
            <button
              onClick={() => ndryshoSasine(a, a.sasia + 1)}
              disabled={duke}
              className="p-1.5 disabled:opacity-30"
              aria-label={`Shto ${a.emri}`}
            ><Plus size={14} /></button>
          </div>
          <span className="flex-1 truncate">{a.emri}</span>
          <span className="font-bold whitespace-nowrap">{lek(a.totali)}</span>
          <button
            onClick={() => hiq(a)}
            disabled={duke}
            className="p-1.5 text-red-600 dark:text-red-400 disabled:opacity-30"
            aria-label={`Hiq ${a.emri}`}
          ><Trash2 size={14} /></button>
        </div>
      ))}

      {shtoHapur ? (
        <div className="mt-2 p-3 rounded-lg bg-surface border grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto_auto_auto] gap-2 items-center">
          <select value={kategori} onChange={(e) => { setKategori(e.target.value); setArtikull(''); }}
            className="p-2 rounded-lg bg-subtle text-sm font-bold" aria-label="Kategoria">
            <option value="">Të gjitha</option>
            {(kategorite || []).map((k) => <option key={k.kategori_id} value={k.kategori_id}>{k.emri}</option>)}
          </select>
          <select value={artikull} onChange={(e) => setArtikull(e.target.value)}
            className="p-2 rounded-lg bg-subtle text-sm font-bold" aria-label="Artikulli">
            <option value="">{menu ? 'Artikulli…' : 'Duke ngarkuar…'}</option>
            {artikujtEFiltruar.map((m) => <option key={m.artikull_id} value={m.artikull_id}>{m.emri} — {lek(m.cmimi)}</option>)}
          </select>
          <input type="number" min="1" value={sasia} onChange={(e) => setSasia(e.target.value)}
            className="w-16 p-2 rounded-lg bg-subtle text-sm font-bold" aria-label="Sasia" />
          <button onClick={shto} disabled={duke || !artikull}
            className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-black">
            SHTO
          </button>
          <button onClick={() => setShtoHapur(false)} className="p-2 text-ink-muted" aria-label="Mbyll"><X size={16} /></button>
        </div>
      ) : (
        <button onClick={() => setShtoHapur(true)} disabled={duke}
          className="mt-2 text-sm font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
          <Plus size={14} /> Shto artikull
        </button>
      )}

      {gabim && (
        <p className="mt-2 text-sm font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-500/15 p-2 rounded-lg">{gabim}</p>
      )}

      <div className="flex justify-between pt-2 mt-2 border-t font-black">
        <span>Totali</span><span>{lek(porosi.totali)}</span>
      </div>
    </div>
  );
}
