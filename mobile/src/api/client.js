import Constants from 'expo-constants';

// Resolve the API base URL.
// Priority: EXPO_PUBLIC_API_URL env var -> app.json `extra.apiUrl` -> localhost.
const fromEnv = process.env.EXPO_PUBLIC_API_URL;
const fromExtra =
  Constants.expoConfig?.extra?.apiUrl || Constants.manifest?.extra?.apiUrl;

export const API_BASE = (fromEnv || fromExtra || 'http://localhost:5000').replace(
  /\/+$/,
  ''
);

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    throw new ApiError(
      `Nuk u lidh me serverin (${API_BASE}). Kontrollo EXPO_PUBLIC_API_URL.`,
      0
    );
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) || `Gabim HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data;
}

const qs = (params) => {
  const entries = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
};

export const api = {
  // ---- auth ----
  login: (payload) => request('/api/login', { method: 'POST', body: payload }),

  // ---- reference data ----
  getKamarieret: () => request('/api/punonjesit?lloji=kamarier'),
  getPunonjesit: () => request('/api/punonjesit'),
  getTavolinat: () => request('/api/tavolinat'),
  getKategorite: () => request('/api/kategorite'),
  getMenu: (kategoriId) => request(`/api/menu${qs({ kategori_id: kategoriId })}`),

  // ---- orders ----
  getPorosite: (params) => request(`/api/porosite${qs(params)}`),
  getPorosi: (id) => request(`/api/porosite/${id}`),
  createPorosi: (payload) =>
    request('/api/porosite', { method: 'POST', body: payload }),
  setPorosiStatus: (id, statusi_porosise) =>
    request(`/api/porosite/${id}/statusi`, {
      method: 'PATCH',
      body: { statusi_porosise },
    }),

  // ---- payments ----
  createPagese: (payload) =>
    request('/api/pagesat', { method: 'POST', body: payload }),

  // ---- inventory ----
  getInventar: () => request('/api/inventar'),
  addStock: (id, sasia) =>
    request(`/api/inventar/pije/${id}`, { method: 'PATCH', body: { sasia } }),

  // ---- statistics ----
  statXhiroDitore: () => request('/api/statistika/xhiro-ditore'),
  statProduktetSot: () => request('/api/statistika/produktet-me-te-shitura'),
  statProduktetTeGjitha: () => request('/api/statistika/produktet-te-gjitha'),
  statDitaMeFitim: () => request('/api/statistika/dita-me-fitim'),
  statFluksiOra: () => request('/api/statistika/fluksi-porosive-ora'),
  statKamarieriMeIMire: () => request('/api/statistika/kamarieri-me-i-mire'),
  statMoneyPeak: () => request('/api/statistika/money-peak'),
  statXhiroTrendet: () => request('/api/statistika/xhiro-trendet'),
  statPerformance: () => request('/api/statistika/performance-kamarieret'),

  // ---- reservations ----
  getRezervimet: () => request('/api/rezervimet'),
  createRezervim: (payload) =>
    request('/api/rezervimet', { method: 'POST', body: payload }),
  setRezervimStatus: (id, statusi) =>
    request(`/api/rezervimet/${id}/statusi`, {
      method: 'PATCH',
      body: { statusi },
    }),
};

export { ApiError };
