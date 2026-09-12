import React, { useState, useEffect } from 'react';
import { ShoppingCart, BarChart3, TrendingUp, Package, Eye, X, Table, Clock, DollarSign, Users, Award, Plus, Save } from 'lucide-react';
import api from '../services/api';

export default function DashboardPage({ perdoruesi }) {
  const [tab, setTab] = useState('xhiro');
  const [xhiro, setXhiro] = useState(null);
  const [produktet, setProduktet] = useState([]);
  const [produktetTeGjitha, setProduktetTeGjitha] = useState([]);
  const [inventar, setInventar] = useState([]);
  const [porosite, setPorosite] = useState([]);
  const [detajet, setDetajet] = useState(null);
  const [produktetTab, setProduktetTab] = useState('sot');
  const [showPaymentForm, setShowPaymentForm] = useState(null);
  const [paymentData, setPaymentData] = useState({
    shuma: '',
    metoda_pageses: 'Cash'
  });
  
  // Statistika state
  const [ditaMeFitim, setDitaMeFitim] = useState([]);
  const [fluksiOra, setFluksiOra] = useState([]);
  const [kamarieri, setKamarieri] = useState([]);
  const [moneyPeak, setMoneyPeak] = useState([]);
  const [trendet, setTrendet] = useState([]);
  const [performance, setPerformance] = useState([]);

  const eshteKamarier = perdoruesi?.lloji === 'kamarier';

  // A waiter sees only their open tables; the server scopes the list to them anyway.
  const ngarkoPorosite = async () => {
    const url = eshteKamarier ? '/api/porosite?statusi=E%20Hapur' : '/api/porosite';
    setPorosite(await api.get(url));
  };

  useEffect(() => {
    (async () => {
      try {
        await ngarkoPorosite();
        // Takings, products and stock are staff-only endpoints.
        if (!eshteKamarier) {
          const [x, p, pGjitha, i] = await Promise.all([
            api.get('/api/statistika/xhiro-ditore'),
            api.get('/api/statistika/produktet-me-te-shitura'),
            api.get('/api/statistika/produktet-te-gjitha'),
            api.get('/api/inventar'),
          ]);
          setXhiro(x);
          setProduktet(p);
          setProduktetTeGjitha(pGjitha);
          setInventar(i);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perdoruesi?.punonjes_id, perdoruesi?.lloji]);
  
  useEffect(() => {
    if (tab === 'statistika') {
      (async () => {
        try {
          const [df, fo, km, mp, tr, pf] = await Promise.all([
            api.get('/api/statistika/dita-me-fitim'),
            api.get('/api/statistika/fluksi-porosive-ora'),
            api.get('/api/statistika/kamarieri-me-i-mire'),
            api.get('/api/statistika/money-peak'),
            api.get('/api/statistika/xhiro-trendet'),
            api.get('/api/statistika/performance-kamarieret'),
          ]);
          setDitaMeFitim(df);
          setFluksiOra(fo);
          setKamarieri(km);
          setMoneyPeak(mp);
          setTrendet(tr);
          setPerformance(pf);
        } catch (err) {
          console.error(err);
        }
      })();
    }
  }, [tab]);

  const shfaqDetajet = async (id) => {
    try {
      setDetajet(await api.get(`/api/porosite/${id}`));
    } catch (err) {
      console.error(err);
      alert(err.message || 'Gabim!');
    }
  };

  const handleCloseOrder = async (tavolineId) => {
    try {
      // Merr të gjitha porosite e hapura në këtë tavolinë
      const allOrders = porosite.filter(p => 
        parseInt(p.tavoline_id) === parseInt(tavolineId) && 
        p.statusi_porosise === 'E Hapur'
      );
      
      if (allOrders.length === 0) {
        alert('Nuk ka porosi për këtë tavolinë!');
        return;
      }

      // Shuma shfaqet për konfirmim; serveri e rillogarit dhe e krahason kur paguhet.
      let totalAmount = 0;
      for (const order of allOrders) {
        const details = await api.get(`/api/porosite/${order.porosi_id}`);
        totalAmount += details.artikujt.reduce((s, a) => s + parseFloat(a.totali), 0);
      }

      setShowPaymentForm({
        tavolineId: tavolineId,
        porosite: allOrders.map(p => p.porosi_id)
      });
      setPaymentData({ shuma: totalAmount, metoda_pageses: 'Cash' });
    } catch (err) {
      console.error(err);
      alert('Gabim në marrjen e detajeve!');
    }
  };

  const handleSavePayment = async () => {
    if (!paymentData.shuma || !paymentData.metoda_pageses) {
      alert('Plotëso fushat e pageses!');
      return;
    }

    try {
      // One call: the server totals the orders, records the payment and closes
      // them in a single transaction, so a failure leaves nothing half-done.
      const result = await api.post('/api/pagesat', {
        porosite: showPaymentForm.porosite,
        shuma: parseFloat(paymentData.shuma),
        metoda_pageses: paymentData.metoda_pageses,
      });

      await ngarkoPorosite();

      setShowPaymentForm(null);
      setPaymentData({ shuma: '', metoda_pageses: 'Cash' });
      setDetajet(null);

      alert(`✅ SUKSES!\n\nPagesa: ${Number(result.totali).toFixed(2)}L\nMetoda: ${paymentData.metoda_pageses}\nID Pagese: ${result.pagese_id}\n\nTavolina u mbyll!`);
    } catch (err) {
      console.error('❌ Gabim në pagesë:', err);
      // A 400 with `totali` means the bill changed since it was shown.
      if (err.body && err.body.totali !== undefined) {
        setPaymentData(d => ({ ...d, shuma: err.body.totali }));
        alert(`❌ ${err.message}\n\nTotali i saktë është ${Number(err.body.totali).toFixed(2)}L — kontrollo dhe konfirmo përsëri.`);
      } else {
        alert(`❌ Gabim: ${err.message}\n\nProvoj përsëri më vonë.`);
      }
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {(perdoruesi?.lloji === 'admin' || perdoruesi?.lloji === 'menaxher') && (
        <div className="flex gap-4 mb-6 flex-wrap">
          {['xhiro', 'produktet', 'inventar', 'porosite', 'statistika'].map(t => (
            <button key={t} onClick={() => setTab(t)} 
              className={`px-6 py-3 rounded-xl font-black ${tab === t ? 'bg-orange-600 text-white' : 'bg-surface'}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {(perdoruesi?.lloji === 'admin' || perdoruesi?.lloji === 'menaxher') ? (
        <>
          {tab === 'xhiro' && xhiro && (
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-surface p-8 rounded-3xl shadow-xl">
                <BarChart3 className="text-orange-600 dark:text-orange-400 mb-4" size={48} />
                <p className="text-ink-muted text-sm">Xhiro Ditore</p>
                <p className="text-4xl font-black">{xhiro.xhiro_totale || 0}L</p>
              </div>
              <div className="bg-surface p-8 rounded-3xl shadow-xl">
                <ShoppingCart className="text-green-600 dark:text-green-400 mb-4" size={48} />
                <p className="text-ink-muted text-sm">Porosi</p>
                <p className="text-4xl font-black">{xhiro.numri_porosive || 0}</p>
              </div>
              <div className="bg-surface p-8 rounded-3xl shadow-xl">
                <Package className="text-blue-600 dark:text-blue-400 mb-4" size={48} />
                <p className="text-ink-muted text-sm">Produkte</p>
                <p className="text-4xl font-black">{xhiro.totali_produkteve || 0}</p>
              </div>
            </div>
          )}

          {tab === 'produktet' && (
            <div className="bg-surface rounded-3xl shadow-xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black"><TrendingUp className="inline text-orange-600 dark:text-orange-400" /> Produktet më të Shitura</h2>
                <div className="flex gap-2 bg-muted p-1 rounded-lg">
                  <button onClick={() => setProduktetTab('sot')}
                    className={`px-4 py-2 rounded-lg font-bold text-sm ${produktetTab === 'sot' ? 'bg-orange-600 text-white' : 'text-ink-muted'}`}>
                    Sot ({produktet.length})
                  </button>
                  <button onClick={() => setProduktetTab('te-gjitha')}
                    className={`px-4 py-2 rounded-lg font-bold text-sm ${produktetTab === 'te-gjitha' ? 'bg-orange-600 text-white' : 'text-ink-muted'}`}>
                    Gjithë Kohës ({produktetTeGjitha.length})
                  </button>
                </div>
              </div>

              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4">Produkti</th>
                    <th className="text-right p-4">Shitur</th>
                    <th className="text-right p-4">Xhiro</th>
                  </tr>
                </thead>
                <tbody>
                  {(produktetTab === 'sot' ? produktet : produktetTeGjitha).map((p, idx) => (
                    <tr key={idx} className="border-b hover:bg-subtle">
                      <td className="p-4">
                        <div className="font-bold">{p.emri}</div>
                        <div className="text-sm text-ink-muted">Çmimi: {p.cmimi_aktual}L</div>
                      </td>
                      <td className="p-4 text-right">{p.totali_shitur}</td>
                      <td className="p-4 text-right font-black text-orange-600 dark:text-orange-400">{parseFloat(p.xhiro_totale).toFixed(2)}L</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(produktetTab === 'sot' ? produktet : produktetTeGjitha).length === 0 && (
                <div className="text-center py-12 text-ink-subtle">
                  <TrendingUp className="mx-auto mb-4" size={64} />
                  <p className="text-lg font-bold">Nuk ka të dhëna</p>
                </div>
              )}
            </div>
          )}

          {tab === 'inventar' && (
            <div className="bg-surface rounded-3xl shadow-xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black"><Package className="inline text-orange-600 dark:text-orange-400" /> Inventari i Pijeve</h2>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-500/10 dark:to-red-500/20 p-4 rounded-xl border-2 border-red-200 dark:border-red-500/30">
                  <p className="text-red-600 dark:text-red-400 text-xs font-bold mb-1">🔴 PA STOK</p>
                  <p className="text-2xl font-black text-red-700 dark:text-red-300">
                    {inventar.filter(i => (i.statusi_stokut || '').includes('PA STOK')).length}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-500/10 dark:to-orange-500/20 p-4 rounded-xl border-2 border-orange-200 dark:border-orange-500/30">
                  <p className="text-orange-600 dark:text-orange-400 text-xs font-bold mb-1">🟠 KRITIK</p>
                  <p className="text-2xl font-black text-orange-700 dark:text-orange-300">
                    {inventar.filter(i => (i.statusi_stokut || '').includes('KRITIK')).length}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-500/10 dark:to-yellow-500/20 p-4 rounded-xl border-2 border-yellow-200 dark:border-yellow-500/30">
                  <p className="text-yellow-600 dark:text-yellow-400 text-xs font-bold mb-1">🟡 I ULËT</p>
                  <p className="text-2xl font-black text-yellow-700 dark:text-yellow-300">
                    {inventar.filter(i => (i.statusi_stokut || '').includes('ULËT')).length}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-500/10 dark:to-green-500/20 p-4 rounded-xl border-2 border-green-200 dark:border-green-500/30">
                  <p className="text-green-600 dark:text-green-400 text-xs font-bold mb-1">🟢 NORMAL</p>
                  <p className="text-2xl font-black text-green-700 dark:text-green-300">
                    {inventar.filter(i => (i.statusi_stokut || '').includes('NORMAL')).length}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {inventar.map(i => (
                  <div key={i.inventar_id} className="flex justify-between items-center p-4 bg-subtle rounded-xl hover:bg-muted">
                    <div className="flex-1">
                      <p className="font-bold text-lg">{i.emri_pijes}</p>
                      <div className="flex gap-4 mt-1">
                        <p className="text-sm text-ink-muted">📦 Stoku: <span className="font-bold">{i.stoku_aktual} {i.njesia}</span></p>
                        <p className="text-sm text-ink-muted">⚠️ Minimal: <span className="font-bold">{i.stoku_minimal} {i.njesia}</span></p>
                        {i.cmimi_per_njesi && (
                          <p className="text-sm text-ink-muted">💰 Çmimi: <span className="font-bold">{i.cmimi_per_njesi}L/{i.njesia}</span></p>
                        )}
                        {i.vlera_totale_stoku && (
                          <p className="text-sm text-ink-muted">💵 Vlerë: <span className="font-bold">{parseFloat(i.vlera_totale_stoku).toFixed(2)}L</span></p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap ${
                        (i.statusi_stokut || '').includes('PA STOK') ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 border-2 border-red-300 dark:border-red-500/40' :
                        (i.statusi_stokut || '').includes('KRITIK') ? 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300 border-2 border-orange-300 dark:border-orange-500/40' : 
                        (i.statusi_stokut || '').includes('ULËT') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300 border-2 border-yellow-300 dark:border-yellow-500/40' : 
                        'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300 border-2 border-green-300 dark:border-green-500/40'
                      }`}>
                        {i.statusi_stokut || 'Normal'}
                      </span>
                      <button onClick={async () => {
                        const sasia = prompt(`Sa ${i.njesia} dëshironi të shtoni?`);
                        if (sasia && parseFloat(sasia) > 0) {
                          try {
                            await api.patch(`/api/inventar/pije/${i.inventar_id}`, { sasia: parseFloat(sasia) });
                            setInventar(await api.get('/api/inventar'));
                            alert(`U shtuan ${sasia} ${i.njesia}!`);
                          } catch (err) {
                            console.error(err);
                            alert(err.message || 'Gabim!');
                          }
                        }
                      }} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm">
                        <Plus size={16} className="inline" /> Shto
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'porosite' && (
            <div className="bg-surface rounded-3xl shadow-xl p-8">
              <h2 className="text-2xl font-black mb-6">Historiku i Porosive</h2>
              <div className="space-y-3">
                {porosite.map(p => (
                  <div key={p.porosi_id} className="flex justify-between items-center p-4 bg-subtle rounded-xl">
                    <div>
                      <p className="font-bold">Porosi #{p.porosi_id} - Tavolina {p.numri_tavolines}</p>
                      <p className="text-sm text-ink-muted">{p.kamarier} • {p.statusi_porosise}</p>
                    </div>
                    <button onClick={() => shfaqDetajet(p.porosi_id)} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
                      <Eye size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'statistika' && (
            <div className="space-y-6">
              {/* Ditët më Fitimprurëse */}
              <div className="bg-surface rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                  <DollarSign className="text-green-600 dark:text-green-400" /> Top 10 Ditët më Fitimprurëse
                </h3>
                <div className="space-y-3">
                  {ditaMeFitim.map((d, i) => {
                    const maxXhiro = Math.max(...ditaMeFitim.map(x => parseFloat(x.xhiro_totale)));
                    const percentage = (parseFloat(d.xhiro_totale) / maxXhiro) * 100;
                    return (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-32 text-right">
                          <div className="font-bold">{new Date(d.data).toLocaleDateString('sq-AL')}</div>
                          <div className="text-xs text-ink-muted">{d.dita_javes?.trim()}</div>
                        </div>
                        <div className="flex-1 relative">
                          <div className="h-12 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-green-500 to-green-600 flex items-center px-4"
                              style={{ width: `${percentage}%` }}>
                              <span className="text-white font-bold text-sm">{parseFloat(d.xhiro_totale).toFixed(0)}L</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-24 text-right text-sm text-ink-muted">
                          {d.numri_porosive} porosi
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Fluksi Sipas Orëve */}
              <div className="bg-surface rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                  <Clock className="text-blue-600 dark:text-blue-400" /> Fluksi i Porosive Sipas Orëve
                </h3>
                <div className="space-y-2">
                  {fluksiOra.map((f, i) => {
                    const maxPorosi = Math.max(...fluksiOra.map(x => x.numri_porosive));
                    const percentage = (f.numri_porosive / maxPorosi) * 100;
                    const isRush = f.statusi_aktivitetit?.includes('RUSH');
                    const isQete = f.statusi_aktivitetit?.includes('QETË');
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-16 text-right font-bold">{f.intervali_kohor}</div>
                        <div className="flex-1 relative h-8">
                          <div className={`h-full rounded ${isRush ? 'bg-red-100 dark:bg-red-500/20' : isQete ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-muted'}`}>
                            <div className={`h-full rounded flex items-center px-2 ${
                              isRush ? 'bg-red-500' : isQete ? 'bg-blue-500' : 'bg-slate-500'
                            }`} style={{ width: `${percentage}%` }}>
                              <span className="text-white text-xs font-bold">{f.numri_porosive}</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-24 text-xs">
                          {isRush ? '🔥 Rush' : isQete ? '😴 Qetë' : '📊 Normal'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Kamarierë Top */}
              <div className="bg-surface rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                  <Award className="text-yellow-600 dark:text-yellow-400" /> Top Kamarierë
                </h3>
                <div className="space-y-4">
                  {kamarieri.slice(0, 10).map((k, i) => {
                    const maxXhiro = Math.max(...kamarieri.map(x => parseFloat(x.xhiro_totale)));
                    const percentage = (parseFloat(k.xhiro_totale) / maxXhiro) * 100;
                    return (
                      <div key={k.punonjes_id} className={`p-4 rounded-xl border-2 ${
                        i === 0 ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-400 dark:border-yellow-500/50' :
                        i === 1 ? 'bg-muted border-line' :
                        i === 2 ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-400 dark:border-orange-500/50' : 'bg-surface border-line'
                      }`}>
                        <div className="flex items-center gap-3 mb-2">
                          {i < 3 && <span className="text-3xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>}
                          <div className="flex-1">
                            <div className="font-black text-lg">{k.emri} {k.mbiemri}</div>
                            <div className="text-sm text-ink-muted">{k.performance_rating}</div>
                          </div>
                        </div>
                        <div className="relative h-8 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-between px-4"
                            style={{ width: `${percentage}%` }}>
                            <span className="text-white font-bold text-sm">{parseFloat(k.xhiro_totale).toFixed(0)}L</span>
                            <span className="text-white text-xs">{k.numri_porosive} porosi</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Money Peak */}
              <div className="bg-surface rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6">🔥 Money Peak Moments</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10">
                        <th className="text-left p-3">Data & Ora</th>
                        <th className="text-left p-3">Periudha</th>
                        <th className="text-right p-3">Xhiro</th>
                        <th className="text-right p-3">Porosi</th>
                        <th className="text-left p-3">Top Produkt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moneyPeak.slice(0, 15).map((m, i) => (
                        <tr key={i} className="border-b hover:bg-orange-50 dark:hover:bg-orange-500/10">
                          <td className="p-3">
                            <div className="font-bold">{new Date(m.data).toLocaleDateString('sq-AL')}</div>
                            <div className="text-sm text-ink-muted">{m.intervali_kohor}</div>
                          </td>
                          <td className="p-3 text-2xl">{m.periudha_dites}</td>
                          <td className="p-3 text-right font-black text-green-600 dark:text-green-400">{parseFloat(m.xhiro_totale).toFixed(2)}L</td>
                          <td className="p-3 text-right">{m.numri_porosive}</td>
                          <td className="p-3 font-bold">{m.produkti_me_popullore || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Trendet */}
              <div className="bg-surface rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6">📊 Trendet e Xhiros (30 Ditë)</h3>
                <div className="space-y-2">
                  {trendet.slice(0, 15).map((t, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 hover:bg-subtle rounded">
                      <div className="w-28 text-right font-bold text-sm">
                        {new Date(t.data).toLocaleDateString('sq-AL')}
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="text-xl">{t.trendi}</div>
                        <div className="font-black text-green-600 dark:text-green-400">{parseFloat(t.xhiro_ditore).toFixed(0)}L</div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                        t.ndryshimi_perqindor > 0 ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                      }`}>
                        {t.ndryshimi_perqindor > 0 ? '+' : ''}{t.ndryshimi_perqindor}%
                      </div>
                      <div className="w-16 text-right text-xs text-ink-muted">
                        #{t.ranking_ditore}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance */}
              <div className="bg-surface rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                  <Users className="text-purple-600 dark:text-purple-400" /> Performance e Detajuar
                </h3>
                <div className="space-y-4">
                  {performance.map(p => (
                    <div key={p.punonjes_id} className="p-5 bg-subtle rounded-xl border-2 border-line">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-black text-xl">{p.kamarier}</div>
                          <div className="text-sm">{p.rating_performace}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-ink-muted">Konsistenca</div>
                          <div className="text-2xl font-black text-orange-600 dark:text-orange-400">{parseFloat(p.konsistenca_perqindore || 0).toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-3 mb-3">
                        <div className="bg-surface p-2 rounded text-center">
                          <div className="text-xs text-ink-muted">Ditë</div>
                          <div className="font-bold">{p.dite_pune}</div>
                        </div>
                        <div className="bg-surface p-2 rounded text-center">
                          <div className="text-xs text-ink-muted">Porosi</div>
                          <div className="font-bold">{p.totali_porosive}</div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-500/10 p-2 rounded text-center">
                          <div className="text-xs text-ink-muted">Xhiro</div>
                          <div className="font-bold text-green-600 dark:text-green-400">{parseFloat(p.totali_xhiros || 0).toFixed(0)}L</div>
                        </div>
                        <div className="bg-surface p-2 rounded text-center">
                          <div className="text-xs text-ink-muted">7 Ditë</div>
                          <div className="font-bold">{parseFloat(p.xhiro_7_dite || 0).toFixed(0)}L</div>
                        </div>
                        <div className="bg-surface p-2 rounded text-center">
                          <div className="text-xs text-ink-muted">30 Ditë</div>
                          <div className="font-bold">{parseFloat(p.xhiro_30_dite || 0).toFixed(0)}L</div>
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-3">
                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 h-3 rounded-full"
                          style={{ width: `${Math.min(parseFloat(p.konsistenca_perqindor || 0), 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-surface rounded-3xl shadow-xl p-8">
          <h2 className="text-2xl font-black mb-6">Tavolinat e Mia</h2>
          <div className="space-y-3">
            {Array.from(new Set(porosite.map(p => p.tavoline_id))).map(tavoline_id => {
              const tavolinaOrders = porosite.filter(p => 
                p.tavoline_id === tavoline_id && 
                p.punonjes_id === perdoruesi?.punonjes_id && 
                p.statusi_porosise === 'E Hapur'
              );
              
              if (tavolinaOrders.length === 0) return null;
              const firstOrder = tavolinaOrders[0];

              return (
                <div key={tavoline_id} className="bg-subtle rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-black text-xl">Tavolina {firstOrder.numri_tavolines}</p>
                      <p className="text-sm text-ink-muted">{tavolinaOrders.length} porosi aktive</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => shfaqDetajet(firstOrder.porosi_id)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold">
                        <Eye size={18} />
                      </button>
                      <button onClick={() => handleCloseOrder(parseInt(tavoline_id))}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold">
                        Mbyll
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {detajet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-8 z-50">
          <div className="bg-surface rounded-3xl p-8 max-w-2xl w-full">
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-black">Porosi #{detajet.porosi.porosi_id}</h2>
              <button onClick={() => setDetajet(null)} className="text-ink-muted"><X size={24} /></button>
            </div>
            <p className="mb-4">Tavolina: {detajet.porosi.numri_tavolines} • {detajet.porosi.kamarier}</p>
            <div className="space-y-2">
              {detajet.artikujt.map(a => (
                <div key={a.artikull_porosie_id} className="flex justify-between p-3 bg-subtle rounded-xl">
                  <span>{a.emri} x{a.sasia}</span>
                  <span className="font-bold">{a.totali}L</span>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t text-2xl font-black text-right">
              TOTAL: {detajet.artikujt.reduce((s, a) => s + parseFloat(a.totali), 0)}L
            </div>
          </div>
        </div>
      )}

      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-8 z-50">
          <div className="bg-surface rounded-3xl p-8 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Pagesa</h2>
              <button onClick={() => setShowPaymentForm(null)} className="text-ink-muted"><X size={24} /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2">Shuma</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={paymentData.shuma} 
                  disabled
                  className="w-full p-3 border-2 border-orange-200 dark:border-orange-500/30 rounded-xl outline-none font-bold text-lg bg-muted cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">Metoda Pagese</label>
                <select 
                  value={paymentData.metoda_pageses} 
                  onChange={(e) => setPaymentData({...paymentData, metoda_pageses: e.target.value})}
                  className="w-full p-3 border-2 border-orange-200 dark:border-orange-500/30 rounded-xl outline-none font-bold"
                >
                  <option value="Cash">Cash</option>
                  <option value="Kartë">Kartë Krediti</option>
                  <option value="Transferim">Transferim Bankar</option>
                </select>
              </div>

              <div className="bg-orange-50 dark:bg-orange-500/10 p-4 rounded-xl border-2 border-orange-200 dark:border-orange-500/30">
                <p className="text-sm text-ink-muted">Totali për pagese:</p>
                <p className="text-3xl font-black text-orange-600 dark:text-orange-400">{parseFloat(paymentData.shuma).toFixed(2)}L</p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleSavePayment}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white p-3 rounded-xl font-black"
                >
                  <Save size={20} className="inline" /> KONFIRMO
                </button>
                <button 
                  onClick={() => setShowPaymentForm(null)}
                  className="px-6 bg-muted p-3 rounded-xl font-black"
                >
                  ANULO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
