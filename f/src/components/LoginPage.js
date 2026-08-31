import React, { useState, useEffect } from 'react';
import { Utensils, LogIn } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || '';

export default function LoginPage({ setPerdoruesi, setFaqja }) {
  const [emri, setEmri] = useState('');
  const [password, setPassword] = useState('');
  const [lloji, setLloji] = useState('admin');
  const [kamarieret, setKamarieret] = useState([]);
  const [kamarierZgjedhur, setKamarierZgjedhur] = useState('');

  useEffect(() => {
    if (lloji === 'kamarier') {
      (async () => {
        try {
          const res = await fetch(`${API_BASE}/api/punonjesit?lloji=kamarier`);
          const data = await res.json();
          setKamarieret(data);
        } catch (err) {
          console.error('Gabim:', err);
        }
      })();
    }
  }, [lloji]);

  const handleLogin = async () => {
    try {
      let requestBody;
      if (lloji === 'kamarier') {
        if (!kamarierZgjedhur || !password) {
          alert('Plotëso fushat!');
          return;
        }
        requestBody = { punonjes_id: parseInt(kamarierZgjedhur), password, lloji: 'kamarier' };
      } else {
        if (!emri || !password) {
          alert('Plotëso fushat!');
          return;
        }
        requestBody = { emri_perdoruesit: emri, password, lloji };
      }

      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const data = await res.json();
      
      if (data.success) {
        setPerdoruesi(data.user);
        setFaqja((data.user.lloji === 'admin' || data.user.lloji === 'menaxher') ? 'dashboard' : 'pos');
      } else {
        alert(data.message || 'Gabim!');
      }
    } catch (err) {
      console.error(err);
      alert('Gabim në lidhje!');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 to-red-600">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Utensils className="text-orange-600" size={48} />
          <h1 className="text-4xl font-black">BitEat</h1>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">Lloji</label>
            <select value={lloji} onChange={(e) => { setLloji(e.target.value); setEmri(''); setPassword(''); setKamarierZgjedhur(''); }} 
              className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-slate-200 focus:border-orange-500 outline-none">
              <option value="admin">Administrator</option>
              <option value="menaxher">Menaxher</option>
              <option value="kamarier">Kamarier</option>
            </select>
          </div>

          {lloji === 'kamarier' ? (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">Emri</label>
                <select value={kamarierZgjedhur} onChange={(e) => setKamarierZgjedhur(e.target.value)}
                  className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-slate-200 focus:border-orange-500 outline-none">
                  <option value="">-- Zgjidhni --</option>
                  {kamarieret.map(k => <option key={k.punonjes_id} value={k.punonjes_id}>{k.emri}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">Fjalëkalimi</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-slate-200 focus:border-orange-500 outline-none"
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">Emri</label>
                <input type="text" value={emri} onChange={(e) => setEmri(e.target.value)} 
                  className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-slate-200 focus:border-orange-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">Fjalëkalimi</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full p-4 bg-slate-50 rounded-xl font-bold border-2 border-slate-200 focus:border-orange-500 outline-none"
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()} />
              </div>
            </>
          )}

          <button onClick={handleLogin}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white p-4 rounded-xl font-black flex items-center justify-center gap-2">
            <LogIn size={24} /> HYRJE
          </button>
        </div>
      </div>
    </div>
  );
}
