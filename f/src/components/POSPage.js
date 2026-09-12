import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Trash2, Save } from 'lucide-react';
import api from '../services/api';

export default function POSPage({ perdoruesi }) {
  const [tavolinat, setTavolinat] = useState([]);
  const [punonjesit, setPunonjesit] = useState([]);
  const [kategorite, setKategorite] = useState([]);
  const [artikujtMenu, setArtikujtMenu] = useState([]);
  const [formPorosi, setFormPorosi] = useState({ tavoline_id: '', punonjes_id: perdoruesi?.punonjes_id || '' });
  const [kategoriZgjedhur, setKategoriZgjedhur] = useState('');
  const [artikullZgjedhur, setArtikullZgjedhur] = useState('');
  const [sasia, setSasia] = useState(1);
  const [shporta, setShporta] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [t, p, k] = await Promise.all([
          api.get('/api/tavolinat'),
          api.get('/api/punonjesit'),
          api.get('/api/kategorite')
        ]);
        setTavolinat(t); setPunonjesit(p); setKategorite(k);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setArtikujtMenu(await api.get(`/api/menu${kategoriZgjedhur ? `?kategori_id=${kategoriZgjedhur}` : ''}`));
      } catch (err) {
        console.error(err);
      }
    })();
  }, [kategoriZgjedhur]);

  const shtoNeShporte = () => {
    if (!artikullZgjedhur) return;
    const artikulli = artikujtMenu.find(a => a.artikull_id === parseInt(artikullZgjedhur));
    const ekziston = shporta.find(i => i.artikull_id === parseInt(artikullZgjedhur));
    if (ekziston) {
      setShporta(shporta.map(i => i.artikull_id === parseInt(artikullZgjedhur) 
        ? { ...i, sasia: i.sasia + parseInt(sasia), totali: (i.sasia + parseInt(sasia)) * i.cmimi } 
        : i));
    } else {
      setShporta([...shporta, { 
        artikull_id: artikulli.artikull_id, 
        emri: artikulli.emri, 
        cmimi: artikulli.cmimi, 
        sasia: parseInt(sasia), 
        totali: artikulli.cmimi * parseInt(sasia) 
      }]);
    }
    setArtikullZgjedhur(''); 
    setSasia(1);
  };

  const handleSaveOrder = async () => {
    if (!formPorosi.tavoline_id || !formPorosi.punonjes_id || shporta.length === 0) {
      return alert("Plotëso fushat!");
    }
    
    try {
      await api.post('/api/porosite', {
        tavoline_id: parseInt(formPorosi.tavoline_id),
        punonjes_id: parseInt(formPorosi.punonjes_id),
        artikujt: shporta.map(i => ({ artikull_id: i.artikull_id, sasia: i.sasia }))
      });
      alert('Porosi u ruajt me sukses!');
      setShporta([]);
      setFormPorosi({ tavoline_id: '', punonjes_id: perdoruesi?.punonjes_id || '' });
    } catch (err) {
      console.error(err);
      // 409 = a drink is out of stock; 400 = the server rejected the basket.
      alert(err.status ? 'Gabim: ' + err.message : 'Gabim në lidhje me serverin!');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto grid grid-cols-3 gap-6">
      <div className="col-span-2 bg-surface p-8 rounded-3xl shadow-xl">
        <h2 className="text-2xl font-black mb-6">Krijo Porosi</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <select value={formPorosi.tavoline_id} onChange={(e) => setFormPorosi({...formPorosi, tavoline_id: e.target.value})} 
            className="p-4 bg-subtle rounded-xl font-bold">
            <option value="">Zgjidhni Tavolinë</option>
            {tavolinat.map(t => <option key={t.tavoline_id} value={t.tavoline_id}>Tavolina {t.numri_tavolines}</option>)}
          </select>
          <select value={formPorosi.punonjes_id} onChange={(e) => setFormPorosi({...formPorosi, punonjes_id: e.target.value})} 
            disabled={perdoruesi?.lloji === 'kamarier'} className="p-4 bg-subtle rounded-xl font-bold">
            <option value="">Kamarier</option>
            {punonjesit.map(p => <option key={p.punonjes_id} value={p.punonjes_id}>{p.emri}</option>)}
          </select>
        </div>
        <div className="space-y-4">
          <select value={kategoriZgjedhur} onChange={(e) => setKategoriZgjedhur(e.target.value)} 
            className="w-full p-4 bg-orange-50 dark:bg-orange-500/10 rounded-xl font-bold">
            <option value="">Të gjitha</option>
            {kategorite.map(k => <option key={k.kategori_id} value={k.kategori_id}>{k.emri}</option>)}
          </select>
          <select value={artikullZgjedhur} onChange={(e) => setArtikullZgjedhur(e.target.value)} 
            className="w-full p-4 bg-subtle rounded-xl font-bold">
            <option value="">Artikulli</option>
            {artikujtMenu.map(a => <option key={a.artikull_id} value={a.artikull_id}>{a.emri} - {a.cmimi}L</option>)}
          </select>
          <input type="number" min="1" value={sasia} onChange={(e) => setSasia(e.target.value)} 
            className="w-full p-4 bg-subtle rounded-xl font-bold" />
          <button onClick={shtoNeShporte} className="w-full bg-green-600 text-white p-4 rounded-xl font-black flex items-center justify-center gap-2">
            <Plus /> SHTO
          </button>
        </div>
      </div>
      <div className="bg-gradient-to-br from-orange-500 to-red-500 dark:from-orange-700 dark:to-red-700 p-8 rounded-3xl text-white">
        <h2 className="text-2xl font-black mb-6"><ShoppingCart className="inline" /> SHPORTA</h2>
        {shporta.map(i => (
          <div key={i.artikull_id} className="bg-white/20 p-4 rounded-xl mb-3">
            <div className="flex justify-between">
              <div>
                <p className="font-black">{i.emri}</p>
                <p className="text-sm">{i.sasia} x {i.cmimi}L</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black">{i.totali}L</p>
                <button onClick={() => setShporta(shporta.filter(x => x.artikull_id !== i.artikull_id))} 
                  className="text-red-300"><Trash2 size={18} /></button>
              </div>
            </div>
          </div>
        ))}
        {shporta.length > 0 && (
          <>
            <div className="border-t border-white/30 pt-4 mt-4 text-3xl font-black">
              TOTAL: {shporta.reduce((s, i) => s + i.totali, 0)}L
            </div>
            <button onClick={handleSaveOrder} className="w-full bg-surface text-orange-600 dark:text-orange-400 p-4 rounded-xl font-black mt-4">
              <Save className="inline" /> RUAJ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
