import React from 'react';
import { Utensils, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

// Navigation per role: waiters live on the floor, staff on the dashboard.
const faqet = (lloji) => (
  lloji === 'kamarier'
    ? [['pos', 'Krijo'], ['tavolinat', 'Salla'], ['rezervime', 'Rezervime']]
    : [['dashboard', 'Dashboard'], ['tavolinat', 'Salla'], ['rezervime', 'Rezervime']]
);

export default function Header({ perdoruesi, onLogout, faqja, setFaqja }) {
  return (
    <div className="bg-surface shadow-lg p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Utensils className="text-orange-600 dark:text-orange-400" size={32} />
          <h1 className="text-2xl font-black">BitEat</h1>
        </div>
        <div className="flex items-center gap-4">
          {faqet(perdoruesi.lloji).map(([id, emri]) => (
            <button key={id} onClick={() => setFaqja(id)}
              className={`px-6 py-2 rounded-xl font-bold ${faqja === id ? 'bg-orange-600 text-white' : 'bg-muted'}`}>
              {emri}
            </button>
          ))}
          <ThemeToggle />
          <div className="flex items-center gap-3 bg-muted px-4 py-2 rounded-xl">
            <div className="text-right">
              <p className="text-sm font-bold">{perdoruesi.emri || perdoruesi.emri_perdoruesit}</p>
              <p className="text-xs text-ink-muted uppercase">{perdoruesi.lloji}</p>
            </div>
            <button onClick={onLogout} title="Dil" className="bg-red-600 text-white p-2 rounded-lg"><LogOut size={20} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
