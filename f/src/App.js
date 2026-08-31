import React, { useState } from 'react';
import LoginPage from './components/LoginPage';
import Header from './components/Header';
import POSPage from './components/POSPage';
import DashboardPage from './components/DashboardPage';
import RezervimePage from './components/RezervimePage';

export default function RestaurantApp() {
  const [perdoruesi, setPerdoruesi] = useState(null);
  const [faqja, setFaqja] = useState('login');

  return (
    <div className="min-h-screen bg-slate-50">
      {!perdoruesi ? (
        <LoginPage setPerdoruesi={setPerdoruesi} setFaqja={setFaqja} />
      ) : (
        <>
          <Header perdoruesi={perdoruesi} setPerdoruesi={setPerdoruesi} faqja={faqja} setFaqja={setFaqja} />
          {faqja === 'pos' && perdoruesi?.lloji !== 'admin' && <POSPage perdoruesi={perdoruesi} />}
          {faqja === 'dashboard' && <DashboardPage perdoruesi={perdoruesi} />}
          {faqja === 'rezervime' && <RezervimePage perdoruesi={perdoruesi} />}
        </>
      )}
    </div>
  );
}