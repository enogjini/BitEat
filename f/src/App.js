import React, { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import Header from './components/Header';
import POSPage from './components/POSPage';
import DashboardPage from './components/DashboardPage';
import RezervimePage from './components/RezervimePage';
import { ThemeProvider } from './theme/ThemeProvider';
import api, { loadSession } from './services/api';

const homeFor = (user) => (user.lloji === 'kamarier' ? 'pos' : 'dashboard');

export default function RestaurantApp() {
  // A stored, unexpired session survives a reload.
  const [perdoruesi, setPerdoruesi] = useState(() => loadSession()?.user ?? null);
  const [faqja, setFaqja] = useState(() => (perdoruesi ? homeFor(perdoruesi) : 'login'));

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
            {faqja === 'pos' && perdoruesi?.lloji !== 'admin' && <POSPage perdoruesi={perdoruesi} />}
            {faqja === 'dashboard' && <DashboardPage perdoruesi={perdoruesi} />}
            {faqja === 'rezervime' && <RezervimePage perdoruesi={perdoruesi} />}
          </>
        )}
      </div>
    </ThemeProvider>
  );
}
