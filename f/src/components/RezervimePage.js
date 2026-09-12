import React, { useState, useEffect } from 'react';
import { Table, Plus, Save } from 'lucide-react';
import api from '../services/api';

export default function RezervimePage({ perdoruesi }) {
  const [rezervime, setRezervime] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [tavolinat, setTavolinat] = useState([]);
  const [formData, setFormData] = useState({
    emri_klientit: '',
    numri_personave: '',
    data_rezervimit: '',
    ora_rezervimit: '',
    tavoline_id: '',
    numri_telefonit: '',
    shenim: ''
  });

  useEffect(() => {
    (async () => {
      try {
        const [r, t] = await Promise.all([api.get('/api/rezervimet'), api.get('/api/tavolinat')]);
        setRezervime(r);
        setTavolinat(t);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!formData.emri_klientit || !formData.numri_personave || !formData.data_rezervimit || !formData.ora_rezervimit) {
      alert('Plotëso fushat!');
      return;
    }

    try {
      await api.post('/api/rezervimet', formData);
      alert('Rezervimi u krijua!');
      setRezervime(await api.get('/api/rezervimet'));
      setFormData({
        emri_klientit: '',
        numri_personave: '',
        data_rezervimit: '',
        ora_rezervimit: '',
        tavoline_id: '',
        numri_telefonit: '',
        shenim: ''
      });
      setShowForm(false);
    } catch (err) {
      console.error(err);
      // 409 = table already booked for that slot; 400 = capacity or a bad field.
      alert(err.status ? err.message : 'Gabim!');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="bg-surface rounded-3xl shadow-xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black"><Table className="inline text-orange-600 dark:text-orange-400" /> Rezervime</h2>
          {perdoruesi?.lloji === 'kamarier' && (
            <button onClick={() => setShowForm(!showForm)}
              className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-black flex items-center gap-2">
              <Plus size={20} /> {showForm ? 'MBYLL' : 'KRIJO'}
            </button>
          )}
        </div>

        {showForm && (
          <div className="bg-orange-50 dark:bg-orange-500/10 p-6 rounded-2xl mb-6 border-2 border-orange-200 dark:border-orange-500/30">
            <h3 className="text-xl font-black mb-4 text-orange-800 dark:text-orange-300">Rezervim i Ri</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2">Emri</label>
                <input type="text" value={formData.emri_klientit} onChange={(e) => setFormData({...formData, emri_klientit: e.target.value})}
                  className="w-full p-3 rounded-xl border-2 border-orange-200 dark:border-orange-500/30 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Numri Personave</label>
                <input type="number" min="1" value={formData.numri_personave} onChange={(e) => setFormData({...formData, numri_personave: e.target.value})}
                  className="w-full p-3 rounded-xl border-2 border-orange-200 dark:border-orange-500/30 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Data</label>
                <input type="date" value={formData.data_rezervimit} onChange={(e) => setFormData({...formData, data_rezervimit: e.target.value})}
                  min={new Date().toISOString().split('T')[0]} className="w-full p-3 rounded-xl border-2 border-orange-200 dark:border-orange-500/30 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Ora</label>
                <input type="time" value={formData.ora_rezervimit} onChange={(e) => setFormData({...formData, ora_rezervimit: e.target.value})}
                  className="w-full p-3 rounded-xl border-2 border-orange-200 dark:border-orange-500/30 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Tavolina</label>
                <select value={formData.tavoline_id} onChange={(e) => setFormData({...formData, tavoline_id: e.target.value})}
                  className="w-full p-3 rounded-xl border-2 border-orange-200 dark:border-orange-500/30 outline-none">
                  <option value="">-- Opsionale --</option>
                  {tavolinat.map(t => <option key={t.tavoline_id} value={t.tavoline_id}>Tavolina {t.numri_tavolines}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Telefon</label>
                <input type="tel" value={formData.numri_telefonit} onChange={(e) => setFormData({...formData, numri_telefonit: e.target.value})}
                  className="w-full p-3 rounded-xl border-2 border-orange-200 dark:border-orange-500/30 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold mb-2">Shënim</label>
                <textarea value={formData.shenim} onChange={(e) => setFormData({...formData, shenim: e.target.value})}
                  rows="2" className="w-full p-3 rounded-xl border-2 border-orange-200 dark:border-orange-500/30 outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleSubmit} className="flex-1 bg-green-600 text-white p-4 rounded-xl font-black">
                <Save size={20} className="inline" /> RUAJ
              </button>
              <button onClick={() => setShowForm(false)} className="px-6 bg-muted p-4 rounded-xl font-black">ANULO</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {rezervime.map(r => (
            <div key={r.rezervim_id} className="flex justify-between items-center p-4 bg-subtle rounded-xl">
              <div className="flex-1">
                <p className="font-bold text-lg">{r.emri_klientit}</p>
                <p className="text-sm text-ink-muted">
                  📅 {new Date(r.data_rezervimit).toLocaleDateString('sq-AL')} • 🕐 {r.ora_rezervimit}
                </p>
                <p className="text-sm text-ink-muted">
                  👥 {r.numri_personave} persona
                  {r.numri_tavolines && ` • 🪑 Tavolina ${r.numri_tavolines}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-4 py-2 rounded-full font-bold text-sm ${
                  r.statusi === 'E konfirmuar' ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' : 
                  r.statusi === 'E anuluar' ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300'
                }`}>
                  {r.statusi}
                </span>
                {r.statusi === 'E konfirmuar' && (
                  <button onClick={async () => {
                    if (window.confirm('Anulo?')) {
                      try {
                        await api.patch(`/api/rezervimet/${r.rezervim_id}/statusi`, { statusi: 'E anuluar' });
                        setRezervime(await api.get('/api/rezervimet'));
                      } catch (err) {
                        console.error(err);
                        alert(err.message || 'Gabim!');
                      }
                    }
                  }} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Anulo</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
