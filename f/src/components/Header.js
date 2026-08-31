import React from 'react';
import { Utensils, LogOut } from 'lucide-react';

export default function Header({ perdoruesi, setPerdoruesi, faqja, setFaqja }) {
  return (
    <div className="bg-white shadow-lg p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Utensils className="text-orange-600" size={32} />
          <h1 className="text-2xl font-black">BitEat</h1>
        </div>
        <div className="flex items-center gap-4">
          {perdoruesi.lloji === 'admin' && (
            <>
              <button onClick={() => setFaqja('dashboard')} className={`px-6 py-2 rounded-xl font-bold ${faqja === 'dashboard' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Dashboard</button>
              <button onClick={() => setFaqja('rezervime')} className={`px-6 py-2 rounded-xl font-bold ${faqja === 'rezervime' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Rezervime</button>
            </>
          )}
          {perdoruesi.lloji === 'menaxher' && (
            <>
              <button onClick={() => setFaqja('dashboard')} className={`px-6 py-2 rounded-xl font-bold ${faqja === 'dashboard' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Dashboard</button>
              <button onClick={() => setFaqja('rezervime')} className={`px-6 py-2 rounded-xl font-bold ${faqja === 'rezervime' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Rezervime</button>
            </>
          )}
          {perdoruesi.lloji === 'kamarier' && (
            <>
              <button onClick={() => setFaqja('pos')} className={`px-6 py-2 rounded-xl font-bold ${faqja === 'pos' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Krijo</button>
              <button onClick={() => setFaqja('dashboard')} className={`px-6 py-2 rounded-xl font-bold ${faqja === 'dashboard' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Porosite</button>
              <button onClick={() => setFaqja('rezervime')} className={`px-6 py-2 rounded-xl font-bold ${faqja === 'rezervime' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Rezervime</button>
            </>
          )}
          <div className="flex items-center gap-3 bg-slate-100 px-4 py-2 rounded-xl">
            <div className="text-right">
              <p className="text-sm font-bold">{perdoruesi.emri || perdoruesi.emri_perdoruesit}</p>
              <p className="text-xs text-slate-500 uppercase">{perdoruesi.lloji}</p>
            </div>
            <button onClick={() => setPerdoruesi(null)} className="bg-red-600 text-white p-2 rounded-lg"><LogOut size={20} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
