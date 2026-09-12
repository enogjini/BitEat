import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import api from '../services/api';

const METODAT = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Kartë', label: 'Kartë Krediti' },
  { value: 'Transferim', label: 'Transferim Bankar' },
];

/**
 * Settle one or more open orders in a single call. The amount shown is the
 * client's view of the bill; the server recomputes it and refuses a mismatch,
 * in which case the modal updates to the real figure and asks again.
 *
 * @param {number[]} porosite  ids of the orders being settled
 * @param {number}   totali    the bill as currently displayed
 * @param {Function} onClose   dismiss without paying
 * @param {Function} onPaid    called with the server's response after success
 */
export default function PaymentModal({ porosite, totali, onClose, onPaid }) {
  const [shuma, setShuma] = useState(Number(totali) || 0);
  const [metoda, setMetoda] = useState('Cash');
  const [duke, setDuke] = useState(false);
  const [gabim, setGabim] = useState(null);

  const paguaj = async () => {
    setDuke(true);
    setGabim(null);
    try {
      // One call: the server totals the orders, records the payment and closes
      // them in a single transaction, so a failure leaves nothing half-done.
      const result = await api.post('/api/pagesat', { porosite, shuma, metoda_pageses: metoda });
      onPaid(result);
    } catch (err) {
      console.error(err);
      // A 400 with `totali` means the bill changed since it was shown.
      if (err.body && err.body.totali !== undefined) {
        setShuma(Number(err.body.totali));
        setGabim(`${err.message}. Totali i saktë është ${Number(err.body.totali).toFixed(2)} L — kontrollo dhe konfirmo përsëri.`);
      } else {
        setGabim(err.message || 'Gabim në pagesë');
      }
    } finally {
      setDuke(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-8 z-50">
      <div className="bg-surface rounded-3xl p-8 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black">Pagesa</h2>
          <button onClick={onClose} className="text-ink-muted" aria-label="Mbyll"><X size={24} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2">Metoda Pagese</label>
            <select
              value={metoda}
              onChange={(e) => setMetoda(e.target.value)}
              className="w-full p-3 border-2 border-orange-200 dark:border-orange-500/30 rounded-xl outline-none font-bold bg-surface"
            >
              {METODAT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div className="bg-orange-50 dark:bg-orange-500/10 p-4 rounded-xl border-2 border-orange-200 dark:border-orange-500/30">
            <p className="text-sm text-ink-muted">
              Totali për pagesë · {porosite.length} {porosite.length === 1 ? 'porosi' : 'porosi'}
            </p>
            <p className="text-3xl font-black text-orange-600 dark:text-orange-400">{shuma.toFixed(2)} L</p>
          </div>

          {gabim && (
            <p className="text-sm font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-500/15 p-3 rounded-xl">
              {gabim}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={paguaj}
              disabled={duke}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white p-3 rounded-xl font-black"
            >
              <Save size={20} className="inline" /> {duke ? 'DUKE PAGUAR…' : 'KONFIRMO'}
            </button>
            <button onClick={onClose} className="px-6 bg-muted p-3 rounded-xl font-black">
              ANULO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
