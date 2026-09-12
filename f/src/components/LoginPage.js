import React, { useState, useEffect } from 'react';
import { Utensils, LogIn } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import api from '../services/api';

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
          setKamarieret(await api.get('/api/punonjesit?lloji=kamarier'));
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

      const user = await api.login(requestBody);
      setPerdoruesi(user);
      setFaqja(user.lloji === 'kamarier' ? 'tavolinat' : 'dashboard');
    } catch (err) {
      console.error(err);
      // A 401 carries the server's reason; anything else is a connection problem.
      alert(err.status ? err.message : 'Gabim në lidhje!');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 to-red-600 dark:from-orange-700 dark:to-red-800">
      <ThemeToggle variant="onColor" className="absolute top-6 right-6" />
      <div className="bg-surface p-10 rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Utensils className="text-orange-600 dark:text-orange-400" size={48} />
          <h1 className="text-4xl font-black">BitEat</h1>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-ink-muted mb-2">Lloji</label>
            <select value={lloji} onChange={(e) => { setLloji(e.target.value); setEmri(''); setPassword(''); setKamarierZgjedhur(''); }} 
              className="w-full p-4 bg-subtle rounded-xl font-bold border-2 border-line focus:border-orange-500 outline-none">
              <option value="admin">Administrator</option>
              <option value="menaxher">Menaxher</option>
              <option value="kamarier">Kamarier</option>
            </select>
          </div>

          {lloji === 'kamarier' ? (
            <>
              <div>
                <label className="block text-sm font-bold text-ink-muted mb-2">Emri</label>
                <select value={kamarierZgjedhur} onChange={(e) => setKamarierZgjedhur(e.target.value)}
                  className="w-full p-4 bg-subtle rounded-xl font-bold border-2 border-line focus:border-orange-500 outline-none">
                  <option value="">-- Zgjidhni --</option>
                  {kamarieret.map(k => <option key={k.punonjes_id} value={k.punonjes_id}>{k.emri}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-ink-muted mb-2">Fjalëkalimi</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full p-4 bg-subtle rounded-xl font-bold border-2 border-line focus:border-orange-500 outline-none"
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-bold text-ink-muted mb-2">Emri</label>
                <input type="text" value={emri} onChange={(e) => setEmri(e.target.value)} 
                  className="w-full p-4 bg-subtle rounded-xl font-bold border-2 border-line focus:border-orange-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-ink-muted mb-2">Fjalëkalimi</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full p-4 bg-subtle rounded-xl font-bold border-2 border-line focus:border-orange-500 outline-none"
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
