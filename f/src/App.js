import React, { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import Header from './components/Header';
import POSPage from './components/POSPage';
import DashboardPage from './components/DashboardPage';
import RezervimePage from './components/RezervimePage';
import TavolinatPage from './components/TavolinatPage';
import { ThemeProvider } from './theme/ThemeProvider';
import api, { loadSession } from './services/api';

const homeFor = (user) => (user.lloji === 'kamarier' ? 'tavolinat' : 'dashboard');

export default function RestaurantApp() {
  // A stored, unexpired session survives a reload.
  const [perdoruesi, setPerdoruesi] = useState(() => loadSession()?.user ?? null);
  const [faqja, setFaqja] = useState(() => (perdoruesi ? homeFor(perdoruesi) : 'login'));
  // Set when the POS is opened from the floor view for a specific table.
  const [tavolinaZgjedhur, setTavolinaZgjedhur] = useState(null);

  const hapPorosiNeTavoline = (tavolina) => {
    setTavolinaZgjedhur(tavolina);
    setFaqja('pos');
  };
  const kthehuNeSalle = () => {
    setTavolinaZgjedhur(null);
    setFaqja('tavolinat');
  };

  const dil = () => {
    api.logout();
    setPerdoruesi(null);
    setFaqja('login');
  };

  // The API client fires this when the server answers 401 (expired token).
  useEffect(() => {
    window.addEventListener('biteat:logout', dil);
    return () => window.removeEventListener('biteat:logout', dil);
  }, []);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-canvas text-ink">
        {!perdoruesi ? (
          <LoginPage setPerdoruesi={setPerdoruesi} setFaqja={setFaqja} />
        ) : (
          <>
            <Header perdoruesi={perdoruesi} onLogout={dil} faqja={faqja} setFaqja={setFaqja} />
            {faqja === 'pos' && perdoruesi?.lloji !== 'admin' && (
              <POSPage
                key={tavolinaZgjedhur?.tavoline_id ?? 'pos'}
                perdoruesi={perdoruesi}
                tavolinaFillestare={tavolinaZgjedhur}
                pasRuajtjes={tavolinaZgjedhur ? kthehuNeSalle : undefined}
              />
            )}
            {faqja === 'tavolinat' && <TavolinatPage perdoruesi={perdoruesi} onHapPorosi={hapPorosiNeTavoline} />}
            {faqja === 'dashboard' && perdoruesi?.lloji !== 'kamarier' && <DashboardPage perdoruesi={perdoruesi} />}
            {faqja === 'rezervime' && <RezervimePage perdoruesi={perdoruesi} />}
          </>
        )}
      </div>
    </ThemeProvider>
  );
}
