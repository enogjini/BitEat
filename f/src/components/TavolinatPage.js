import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Users, Clock, RefreshCw, X, Plus, CreditCard, CalendarClock } from 'lucide-react';
import api from '../services/api';
import PaymentModal from './PaymentModal';
import OrderEditor, { qeNga } from './OrderEditor';
import ScanReceiptButton from './ScanReceiptButton';

const RIFRESKIM_MS = 15000;

// Status → card styling. Status tints are the one place the README allows
// explicit dark: variants.
const STILI = {
  'E lirë': {
    card: 'bg-green-50 border-green-300 hover:border-green-500 dark:bg-green-500/10 dark:border-green-500/40',
    chip: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    dot: 'bg-green-500',
  },
  'E zënë': {
    card: 'bg-orange-50 border-orange-300 hover:border-orange-500 dark:bg-orange-500/10 dark:border-orange-500/40',
    chip: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  'E rezervuar': {
    card: 'bg-blue-50 border-blue-300 hover:border-blue-500 dark:bg-blue-500/10 dark:border-blue-500/40',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
};

const lek = (n) => `${Number(n || 0).toFixed(0)} L`;
const ora = (t) => (t ? String(t).slice(0, 5) : '');

/** Group the flat table list by location, keeping the server's order. */
function sipasVendndodhjes(tavolinat) {
  const grupet = new Map();
  for (const t of tavolinat) {
    const vend = t.vendndodhja || 'Pa vendndodhje';
    if (!grupet.has(vend)) grupet.set(vend, []);
    grupet.get(vend).push(t);
  }
  return [...grupet.entries()];
}

export default function TavolinatPage({ perdoruesi, onHapPorosi }) {
  const [tavolinat, setTavolinat] = useState([]);
  const [gabim, setGabim] = useState(null);
  const [dukeNgarkuar, setDukeNgarkuar] = useState(true);
  const [zgjedhur, setZgjedhur] = useState(null); // status row of the tapped table
  const [detaje, setDetaje] = useState(null); // /api/tavolinat/:id/porosite
  const [pagesa, setPagesa] = useState(false);
  const [njoftim, setNjoftim] = useState(null);
  const [menu, setMenu] = useState(null); // { artikujt, kategorite } once loaded

  const ngarko = useCallback(async () => {
    try {
      setTavolinat(await api.get('/api/tavolinat/status'));
      setGabim(null);
    } catch (err) {
      console.error(err);
      setGabim('Nuk u ngarkua salla — ' + (err.message || 'gabim në lidhje'));
    } finally {
      setDukeNgarkuar(false);
    }
  }, []);

  // Live-ish: poll while the page is open, and refresh when the tab comes back.
  useEffect(() => {
    ngarko();
    const timer = setInterval(ngarko, RIFRESKIM_MS);
    const kurKthehet = () => { if (document.visibilityState === 'visible') ngarko(); };
    document.addEventListener('visibilitychange', kurKthehet);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', kurKthehet);
    };
  }, [ngarko]);

  useEffect(() => {
    if (!njoftim) return undefined;
    const t = setTimeout(() => setNjoftim(null), 6000);
    return () => clearTimeout(t);
  }, [njoftim]);

  const ngarkoDetajet = async (tavoline_id) => {
    setDetaje(await api.get(`/api/tavolinat/${tavoline_id}/porosite`));
  };

  const hapTavolinen = async (t) => {
    setZgjedhur(t);
    setDetaje(null);
    try {
      await ngarkoDetajet(t.tavoline_id);
    } catch (err) {
      console.error(err);
      setNjoftim({ lloji: 'gabim', tekst: err.message || 'Gabim' });
      setZgjedhur(null);
    }
    // The item picker needs the menu; fetch it once, in the background.
    if (!menu) {
      Promise.all([api.get('/api/menu'), api.get('/api/kategorite')])
        .then(([artikujt, kategorite]) => setMenu({ artikujt, kategorite }))
        .catch((err) => console.error(err));
    }
  };

  // After a line edit: refresh the panel and the map behind it.
  const pasNdryshimit = async () => {
    await ngarkoDetajet(zgjedhur.tavoline_id);
    ngarko();
  };

  const mbyllPanelin = () => { setZgjedhur(null); setDetaje(null); setPagesa(false); };

  const pasPageses = async (result) => {
    setPagesa(false);
    setNjoftim({
      lloji: 'sukses',
      tekst: `Tavolina ${zgjedhur.numri_tavolines} u mbyll — ${lek(result.totali)} (${result.pagesat.length} ${result.pagesat.length === 1 ? 'pagesë' : 'pagesa'})`,
    });
    mbyllPanelin();
    ngarko();
  };

  const grupet = sipasVendndodhjes(tavolinat);
  const numero = (statusi) => tavolinat.filter((t) => t.statusi === statusi).length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-black flex items-center gap-2">
          <LayoutGrid className="text-orange-600 dark:text-orange-400" /> Salla
        </h2>
        <div className="flex items-center gap-3 text-sm font-bold">
          {Object.entries(STILI).map(([statusi, s]) => (
            <span key={statusi} className={`px-3 py-1 rounded-full ${s.chip}`}>
              {statusi} · {numero(statusi)}
            </span>
          ))}
          <button onClick={ngarko} title="Rifresko" className="p-2 rounded-lg bg-muted text-ink-muted hover:text-ink">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {njoftim && (
        <div className={`mb-6 p-4 rounded-xl font-bold ${
          njoftim.lloji === 'sukses'
            ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300'
            : 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
        }`}>
          {njoftim.tekst}
        </div>
      )}

      {gabim && (
        <div className="mb-6 p-4 rounded-xl font-bold bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">{gabim}</div>
      )}

      {dukeNgarkuar && tavolinat.length === 0 && (
        <p className="text-ink-subtle">Duke ngarkuar sallën…</p>
      )}

      {grupet.map(([vend, lista]) => (
        <section key={vend} className="mb-8">
          <h3 className="text-sm font-black uppercase tracking-wide text-ink-muted mb-3">{vend}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {lista.map((t) => {
              const s = STILI[t.statusi] || STILI['E lirë'];
              return (
                <button
                  key={t.tavoline_id}
                  onClick={() => hapTavolinen(t)}
                  className={`text-left p-4 rounded-2xl border-2 transition-colors ${s.card}`}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-xl font-black">Tavolina {t.numri_tavolines}</p>
                    <span className="flex items-center gap-1 text-sm text-ink-muted"><Users size={14} /> {t.kapaciteti}</span>
                  </div>
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold ${s.chip}`}>
                    <span className={`inline-block w-2 h-2 rounded-full mr-1 ${s.dot}`} />{t.statusi}
                  </span>

                  {t.statusi === 'E zënë' && (
                    <div className="mt-3 text-sm space-y-1">
                      <p className="font-bold truncate">{t.kamarier}</p>
                      <p className="text-ink-muted flex items-center gap-1">
                        <Clock size={14} /> {qeNga(t.ora_porosise)} · {t.numri_porosive} {t.numri_porosive === 1 ? 'porosi' : 'porosi'}
                      </p>
                      <p className="text-lg font-black">{lek(t.totali_hapur)}</p>
                    </div>
                  )}

                  {t.rezervim_id && (
                    <p className="mt-3 text-sm text-ink-muted flex items-center gap-1">
                      <CalendarClock size={14} /> {ora(t.rezervim_ora)} {t.rezervim_klienti} ({t.rezervim_persona})
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {zgjedhur && !pagesa && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-8 z-40" onClick={mbyllPanelin}>
          <div className="bg-surface rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-black">Tavolina {zgjedhur.numri_tavolines}</h2>
                <p className="text-sm text-ink-muted">{zgjedhur.vendndodhja} · <Users size={14} className="inline" /> {zgjedhur.kapaciteti} vende</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${(STILI[zgjedhur.statusi] || STILI['E lirë']).chip}`}>{zgjedhur.statusi}</span>
                <button onClick={mbyllPanelin} className="text-ink-muted" aria-label="Mbyll"><X size={24} /></button>
              </div>
            </div>

            {zgjedhur.rezervim_id && (
              <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <CalendarClock size={16} /> Rezervim sot në {ora(zgjedhur.rezervim_ora)} — {zgjedhur.rezervim_klienti}, {zgjedhur.rezervim_persona} persona
              </div>
            )}

            {!detaje ? (
              <p className="text-ink-subtle">Duke ngarkuar…</p>
            ) : detaje.porosite.length === 0 ? (
              <p className="text-ink-subtle mb-6">Nuk ka porosi të hapura.</p>
            ) : (
              <div className="space-y-3 mb-6">
                {detaje.porosite.map((p) => (
                  <OrderEditor
                    key={p.porosi_id}
                    porosi={p}
                    perdoruesi={perdoruesi}
                    menu={menu?.artikujt ?? null}
                    kategorite={menu?.kategorite ?? null}
                    onChanged={pasNdryshimit}
                  />
                ))}
                <div className="flex justify-between text-2xl font-black px-1">
                  <span>TOTAL</span><span className="text-orange-600 dark:text-orange-400">{lek(detaje.totali)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {perdoruesi?.lloji !== 'admin' && (
                <button
                  onClick={() => onHapPorosi(zgjedhur)}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white p-3 rounded-xl font-black"
                >
                  <Plus size={20} className="inline" /> {detaje && detaje.porosite.length > 0 ? 'SHTO POROSI' : 'HAP POROSI'}
                </button>
              )}
              {perdoruesi?.lloji !== 'admin' && (
                <ScanReceiptButton tavolineId={zgjedhur.tavoline_id} onChanged={pasNdryshimit} />
              )}
              {detaje && detaje.porosite.length > 0 && (
                <button
                  onClick={() => setPagesa(true)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white p-3 rounded-xl font-black"
                >
                  <CreditCard size={20} className="inline" /> PAGUAJ {lek(detaje.totali)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {zgjedhur && pagesa && detaje && (
        <PaymentModal
          porosite={detaje.porosite.map((p) => p.porosi_id)}
          totali={detaje.totali}
          onClose={() => setPagesa(false)}
          onPaid={pasPageses}
        />
      )}
    </div>
  );
}
