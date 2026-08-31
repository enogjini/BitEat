import React, { useState, useEffect } from 'react';
import { ShoppingCart, BarChart3, TrendingUp, Package, Eye, X, Table, Clock, DollarSign, Users, Award, Plus, Save } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || '';

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

  useEffect(() => {
    (async () => {
      const x = await fetch(`${API_BASE}/api/statistika/xhiro-ditore`).then(r => r.json());
      const p = await fetch(`${API_BASE}/api/statistika/produktet-me-te-shitura`).then(r => r.json());
      const pGjitha = await fetch(`${API_BASE}/api/statistika/produktet-te-gjitha`).then(r => r.json());
      const i = await fetch(`${API_BASE}/api/inventar`).then(r => r.json());
      
      let porositeUrl = `${API_BASE}/api/porosite`;
      if (perdoruesi?.lloji === 'kamarier') {
        porositeUrl += `?punonjes_id=${perdoruesi.punonjes_id}&statusi=E Hapur`;
      }
      const po = await fetch(porositeUrl).then(r => r.json());
      
      setXhiro(x); 
      setProduktet(p); 
      setProduktetTeGjitha(pGjitha);
      setInventar(i); 
      setPorosite(po);
    })();
  }, [perdoruesi?.punonjes_id, perdoruesi?.lloji]);
  
  useEffect(() => {
    if (tab === 'statistika') {
      (async () => {
        const df = await fetch(`${API_BASE}/api/statistika/dita-me-fitim`).then(r => r.json());
        const fo = await fetch(`${API_BASE}/api/statistika/fluksi-porosive-ora`).then(r => r.json());
        const km = await fetch(`${API_BASE}/api/statistika/kamarieri-me-i-mire`).then(r => r.json());
        const mp = await fetch(`${API_BASE}/api/statistika/money-peak`).then(r => r.json());
        const tr = await fetch(`${API_BASE}/api/statistika/xhiro-trendet`).then(r => r.json());
        const pf = await fetch(`${API_BASE}/api/statistika/performance-kamarieret`).then(r => r.json());
        
        setDitaMeFitim(df);
        setFluksiOra(fo);
        setKamarieri(km);
        setMoneyPeak(mp);
        setTrendet(tr);
        setPerformance(pf);
      })();
    }
  }, [tab]);

  const shfaqDetajet = async (id) => {
    const d = await fetch(`${API_BASE}/api/porosite/${id}`).then(r => r.json());
    setDetajet(d);
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

      let totalAmount = 0;
      // Merr detajet për secilin porosi dhe llogarit totalin
      for (const order of allOrders) {
        const details = await fetch(`${API_BASE}/api/porosite/${order.porosi_id}`).then(r => r.json());
        const orderTotal = details.artikujt.reduce((s, a) => s + parseFloat(a.totali), 0);
        totalAmount += orderTotal;
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
      const porositeIds = showPaymentForm.porosite;
      let pagese_id = null;
      
      // HAPI 1: Regjistro pagesa në tabelën pagesat
      console.log('📝 Regjistro pagesa...', { porosi_id: porositeIds[0], shuma: paymentData.shuma });
      const paymentRes = await fetch(`${API_BASE}/api/pagesat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          porosi_id: porositeIds[0],
          shuma: parseFloat(paymentData.shuma),
          metoda_pageses: paymentData.metoda_pageses,
          ora_pageses: new Date().toISOString()
        })
      });

      if (!paymentRes.ok) {
        throw new Error(`Gabim në regjistrimin e pageses: ${paymentRes.status}`);
      }

      const paymentDataRes = await paymentRes.json();
      
      if (!paymentDataRes.success) {
        throw new Error('Pagesa nuk u ruajt në databazë');
      }
      
      pagese_id = paymentDataRes.pagese_id;
      console.log('✅ Pagesa u ruajt:', pagese_id);

      // HAPI 2: Ndrysho statusin e të gjithë porosive në 'E Mbyllur'
      console.log('📝 Përditëso statusin e porosive...', porositeIds);
      
      for (const porosiId of porositeIds) {
        const statusRes = await fetch(`${API_BASE}/api/porosite/${porosiId}/statusi`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statusi_porosise: 'E Mbyllur' })
        });

        if (!statusRes.ok) {
          throw new Error(`Gabim në përditësimin e porosisë ${porosiId}: ${statusRes.status}`);
        }
        
        const statusData = await statusRes.json();
        if (!statusData.success) {
          throw new Error(`Porosi ${porosiId} nuk u përditësua`);
        }
        
        console.log(`✅ Porosi ${porosiId} u mbyll`);
      }

      // HAPI 3: Rifresko listen e porosive
      console.log('🔄 Rifresko listen e porosive...');
      let porositeUrl = `${API_BASE}/api/porosite`;
      if (perdoruesi?.lloji === 'kamarier') {
        porositeUrl += `?punonjes_id=${perdoruesi.punonjes_id}&statusi=E Hapur`;
      }
      const po = await fetch(porositeUrl).then(r => r.json());
      setPorosite(po);

      // HAPI 4: Cleanup UI
      setShowPaymentForm(null);
      setPaymentData({ shuma: '', metoda_pageses: 'Cash' });
      setDetajet(null);

      // ✅ SUKSES
      alert(`✅ SUKSES!\n\nPagesa: ${parseFloat(paymentData.shuma).toFixed(2)}L\nMetoda: ${paymentData.metoda_pageses}\nID Pagese: ${pagese_id}\n\nTavolina u mbyll!`);
      console.log('✅ Transakcion i plotë i suksesshëm');
      
    } catch (err) {
      console.error('❌ Gabim në transakcion:', err);
      alert(`❌ Gabim: ${err.message}\n\nProvoj përsëri më vonë.`);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {(perdoruesi?.lloji === 'admin' || perdoruesi?.lloji === 'menaxher') && (
        <div className="flex gap-4 mb-6 flex-wrap">
          {['xhiro', 'produktet', 'inventar', 'porosite', 'statistika'].map(t => (
            <button key={t} onClick={() => setTab(t)} 
              className={`px-6 py-3 rounded-xl font-black ${tab === t ? 'bg-orange-600 text-white' : 'bg-white'}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {(perdoruesi?.lloji === 'admin' || perdoruesi?.lloji === 'menaxher') ? (
        <>
          {tab === 'xhiro' && xhiro && (
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white p-8 rounded-3xl shadow-xl">
                <BarChart3 className="text-orange-600 mb-4" size={48} />
                <p className="text-slate-500 text-sm">Xhiro Ditore</p>
                <p className="text-4xl font-black">{xhiro.xhiro_totale || 0}L</p>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-xl">
                <ShoppingCart className="text-green-600 mb-4" size={48} />
                <p className="text-slate-500 text-sm">Porosi</p>
                <p className="text-4xl font-black">{xhiro.numri_porosive || 0}</p>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-xl">
                <Package className="text-blue-600 mb-4" size={48} />
                <p className="text-slate-500 text-sm">Produkte</p>
                <p className="text-4xl font-black">{xhiro.totali_produkteve || 0}</p>
              </div>
            </div>
          )}

          {tab === 'produktet' && (
            <div className="bg-white rounded-3xl shadow-xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black"><TrendingUp className="inline text-orange-600" /> Produktet më të Shitura</h2>
                <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setProduktetTab('sot')}
                    className={`px-4 py-2 rounded-lg font-bold text-sm ${produktetTab === 'sot' ? 'bg-orange-600 text-white' : 'text-slate-600'}`}>
                    Sot ({produktet.length})
                  </button>
                  <button onClick={() => setProduktetTab('te-gjitha')}
                    className={`px-4 py-2 rounded-lg font-bold text-sm ${produktetTab === 'te-gjitha' ? 'bg-orange-600 text-white' : 'text-slate-600'}`}>
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
                    <tr key={idx} className="border-b hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-bold">{p.emri}</div>
                        <div className="text-sm text-slate-500">Çmimi: {p.cmimi_aktual}L</div>
                      </td>
                      <td className="p-4 text-right">{p.totali_shitur}</td>
                      <td className="p-4 text-right font-black text-orange-600">{parseFloat(p.xhiro_totale).toFixed(2)}L</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(produktetTab === 'sot' ? produktet : produktetTeGjitha).length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <TrendingUp className="mx-auto mb-4" size={64} />
                  <p className="text-lg font-bold">Nuk ka të dhëna</p>
                </div>
              )}
            </div>
          )}

          {tab === 'inventar' && (
            <div className="bg-white rounded-3xl shadow-xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black"><Package className="inline text-orange-600" /> Inventari i Pijeve</h2>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-xl border-2 border-red-200">
                  <p className="text-red-600 text-xs font-bold mb-1">🔴 PA STOK</p>
                  <p className="text-2xl font-black text-red-700">
                    {inventar.filter(i => (i.statusi_stokut || '').includes('PA STOK')).length}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border-2 border-orange-200">
                  <p className="text-orange-600 text-xs font-bold mb-1">🟠 KRITIK</p>
                  <p className="text-2xl font-black text-orange-700">
                    {inventar.filter(i => (i.statusi_stokut || '').includes('KRITIK')).length}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-xl border-2 border-yellow-200">
                  <p className="text-yellow-600 text-xs font-bold mb-1">🟡 I ULËT</p>
                  <p className="text-2xl font-black text-yellow-700">
                    {inventar.filter(i => (i.statusi_stokut || '').includes('ULËT')).length}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border-2 border-green-200">
                  <p className="text-green-600 text-xs font-bold mb-1">🟢 NORMAL</p>
                  <p className="text-2xl font-black text-green-700">
                    {inventar.filter(i => (i.statusi_stokut || '').includes('NORMAL')).length}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {inventar.map(i => (
                  <div key={i.inventar_id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl hover:bg-slate-100">
                    <div className="flex-1">
                      <p className="font-bold text-lg">{i.emri_pijes}</p>
                      <div className="flex gap-4 mt-1">
                        <p className="text-sm text-slate-600">📦 Stoku: <span className="font-bold">{i.stoku_aktual} {i.njesia}</span></p>
                        <p className="text-sm text-slate-600">⚠️ Minimal: <span className="font-bold">{i.stoku_minimal} {i.njesia}</span></p>
                        {i.cmimi_per_njesi && (
                          <p className="text-sm text-slate-600">💰 Çmimi: <span className="font-bold">{i.cmimi_per_njesi}L/{i.njesia}</span></p>
                        )}
                        {i.vlera_totale_stoku && (
                          <p className="text-sm text-slate-600">💵 Vlerë: <span className="font-bold">{parseFloat(i.vlera_totale_stoku).toFixed(2)}L</span></p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap ${
                        (i.statusi_stokut || '').includes('PA STOK') ? 'bg-red-100 text-red-800 border-2 border-red-300' :
                        (i.statusi_stokut || '').includes('KRITIK') ? 'bg-orange-100 text-orange-800 border-2 border-orange-300' : 
                        (i.statusi_stokut || '').includes('ULËT') ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-300' : 
                        'bg-green-100 text-green-800 border-2 border-green-300'
                      }`}>
                        {i.statusi_stokut || 'Normal'}
                      </span>
                      <button onClick={async () => {
                        const sasia = prompt(`Sa ${i.njesia} dëshironi të shtoni?`);
                        if (sasia && parseFloat(sasia) > 0) {
                          try {
                            const res = await fetch(`${API_BASE}/api/inventar/pije/${i.inventar_id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ sasia: parseFloat(sasia) })
                            });
                            if (res.ok) {
                              const updatedInventar = await fetch(`${API_BASE}/api/inventar`).then(r => r.json());
                              setInventar(updatedInventar);
                              alert(`U shtuan ${sasia} ${i.njesia}!`);
                            }
                          } catch (err) {
                            console.error(err);
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
            <div className="bg-white rounded-3xl shadow-xl p-8">
              <h2 className="text-2xl font-black mb-6">Historiku i Porosive</h2>
              <div className="space-y-3">
                {porosite.map(p => (
                  <div key={p.porosi_id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-bold">Porosi #{p.porosi_id} - Tavolina {p.numri_tavolines}</p>
                      <p className="text-sm text-slate-500">{p.kamarier} • {p.statusi_porosise}</p>
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
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                  <DollarSign className="text-green-600" /> Top 10 Ditët më Fitimprurëse
                </h3>
                <div className="space-y-3">
                  {ditaMeFitim.map((d, i) => {
                    const maxXhiro = Math.max(...ditaMeFitim.map(x => parseFloat(x.xhiro_totale)));
                    const percentage = (parseFloat(d.xhiro_totale) / maxXhiro) * 100;
                    return (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-32 text-right">
                          <div className="font-bold">{new Date(d.data).toLocaleDateString('sq-AL')}</div>
                          <div className="text-xs text-slate-500">{d.dita_javes?.trim()}</div>
                        </div>
                        <div className="flex-1 relative">
                          <div className="h-12 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-green-500 to-green-600 flex items-center px-4"
                              style={{ width: `${percentage}%` }}>
                              <span className="text-white font-bold text-sm">{parseFloat(d.xhiro_totale).toFixed(0)}L</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-24 text-right text-sm text-slate-600">
                          {d.numri_porosive} porosi
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Fluksi Sipas Orëve */}
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                  <Clock className="text-blue-600" /> Fluksi i Porosive Sipas Orëve
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
                          <div className={`h-full rounded ${isRush ? 'bg-red-100' : isQete ? 'bg-blue-100' : 'bg-slate-100'}`}>
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
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                  <Award className="text-yellow-600" /> Top Kamarierë
                </h3>
                <div className="space-y-4">
                  {kamarieri.slice(0, 10).map((k, i) => {
                    const maxXhiro = Math.max(...kamarieri.map(x => parseFloat(x.xhiro_totale)));
                    const percentage = (parseFloat(k.xhiro_totale) / maxXhiro) * 100;
                    return (
                      <div key={k.punonjes_id} className={`p-4 rounded-xl border-2 ${
                        i === 0 ? 'bg-yellow-50 border-yellow-400' :
                        i === 1 ? 'bg-slate-100 border-slate-400' :
                        i === 2 ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-200'
                      }`}>
                        <div className="flex items-center gap-3 mb-2">
                          {i < 3 && <span className="text-3xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>}
                          <div className="flex-1">
                            <div className="font-black text-lg">{k.emri} {k.mbiemri}</div>
                            <div className="text-sm text-slate-600">{k.performance_rating}</div>
                          </div>
                        </div>
                        <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden">
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
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6">🔥 Money Peak Moments</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-orange-200 bg-orange-50">
                        <th className="text-left p-3">Data & Ora</th>
                        <th className="text-left p-3">Periudha</th>
                        <th className="text-right p-3">Xhiro</th>
                        <th className="text-right p-3">Porosi</th>
                        <th className="text-left p-3">Top Produkt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moneyPeak.slice(0, 15).map((m, i) => (
                        <tr key={i} className="border-b hover:bg-orange-50">
                          <td className="p-3">
                            <div className="font-bold">{new Date(m.data).toLocaleDateString('sq-AL')}</div>
                            <div className="text-sm text-slate-500">{m.intervali_kohor}</div>
                          </td>
                          <td className="p-3 text-2xl">{m.periudha_dites}</td>
                          <td className="p-3 text-right font-black text-green-600">{parseFloat(m.xhiro_totale).toFixed(2)}L</td>
                          <td className="p-3 text-right">{m.numri_porosive}</td>
                          <td className="p-3 font-bold">{m.produkti_me_popullore || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Trendet */}
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6">📊 Trendet e Xhiros (30 Ditë)</h3>
                <div className="space-y-2">
                  {trendet.slice(0, 15).map((t, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded">
                      <div className="w-28 text-right font-bold text-sm">
                        {new Date(t.data).toLocaleDateString('sq-AL')}
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="text-xl">{t.trendi}</div>
                        <div className="font-black text-green-600">{parseFloat(t.xhiro_ditore).toFixed(0)}L</div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                        t.ndryshimi_perqindor > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {t.ndryshimi_perqindor > 0 ? '+' : ''}{t.ndryshimi_perqindor}%
                      </div>
                      <div className="w-16 text-right text-xs text-slate-500">
                        #{t.ranking_ditore}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance */}
              <div className="bg-white rounded-3xl shadow-xl p-8">
                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                  <Users className="text-purple-600" /> Performance e Detajuar
                </h3>
                <div className="space-y-4">
                  {performance.map(p => (
                    <div key={p.punonjes_id} className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-black text-xl">{p.kamarier}</div>
                          <div className="text-sm">{p.rating_performace}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-slate-500">Konsistenca</div>
                          <div className="text-2xl font-black text-orange-600">{parseFloat(p.konsistenca_perqindore || 0).toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-3 mb-3">
                        <div className="bg-white p-2 rounded text-center">
                          <div className="text-xs text-slate-500">Ditë</div>
                          <div className="font-bold">{p.dite_pune}</div>
                        </div>
                        <div className="bg-white p-2 rounded text-center">
                          <div className="text-xs text-slate-500">Porosi</div>
                          <div className="font-bold">{p.totali_porosive}</div>
                        </div>
                        <div className="bg-green-50 p-2 rounded text-center">
                          <div className="text-xs text-slate-500">Xhiro</div>
                          <div className="font-bold text-green-600">{parseFloat(p.totali_xhiros || 0).toFixed(0)}L</div>
                        </div>
                        <div className="bg-white p-2 rounded text-center">
                          <div className="text-xs text-slate-500">7 Ditë</div>
                          <div className="font-bold">{parseFloat(p.xhiro_7_dite || 0).toFixed(0)}L</div>
                        </div>
                        <div className="bg-white p-2 rounded text-center">
                          <div className="text-xs text-slate-500">30 Ditë</div>
                          <div className="font-bold">{parseFloat(p.xhiro_30_dite || 0).toFixed(0)}L</div>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-3">
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
        <div className="bg-white rounded-3xl shadow-xl p-8">
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
                <div key={tavoline_id} className="bg-slate-50 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-black text-xl">Tavolina {firstOrder.numri_tavolines}</p>
                      <p className="text-sm text-slate-600">{tavolinaOrders.length} porosi aktive</p>
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
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full">
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-black">Porosi #{detajet.porosi.porosi_id}</h2>
              <button onClick={() => setDetajet(null)} className="text-slate-500"><X size={24} /></button>
            </div>
            <p className="mb-4">Tavolina: {detajet.porosi.numri_tavolines} • {detajet.porosi.kamarier}</p>
            <div className="space-y-2">
              {detajet.artikujt.map(a => (
                <div key={a.artikull_porosie_id} className="flex justify-between p-3 bg-slate-50 rounded-xl">
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
          <div className="bg-white rounded-3xl p-8 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Pagesa</h2>
              <button onClick={() => setShowPaymentForm(null)} className="text-slate-500"><X size={24} /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2">Shuma</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={paymentData.shuma} 
                  disabled
                  className="w-full p-3 border-2 border-orange-200 rounded-xl outline-none font-bold text-lg bg-slate-100 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">Metoda Pagese</label>
                <select 
                  value={paymentData.metoda_pageses} 
                  onChange={(e) => setPaymentData({...paymentData, metoda_pageses: e.target.value})}
                  className="w-full p-3 border-2 border-orange-200 rounded-xl outline-none font-bold"
                >
                  <option value="Cash">Cash</option>
                  <option value="Kartë">Kartë Krediti</option>
                  <option value="Transferim">Transferim Bankar</option>
                </select>
              </div>

              <div className="bg-orange-50 p-4 rounded-xl border-2 border-orange-200">
                <p className="text-sm text-slate-600">Totali për pagese:</p>
                <p className="text-3xl font-black text-orange-600">{parseFloat(paymentData.shuma).toFixed(2)}L</p>
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
                  className="px-6 bg-slate-300 p-3 rounded-xl font-black"
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
