// Shared design tokens for the BitEat mobile app.
// Mirrors the orange/slate palette used by the web frontend.

export const colors = {
  primary: '#ea580c', // orange-600
  primaryDark: '#c2410c', // orange-700
  primarySoft: '#ffedd5', // orange-100
  primaryTint: '#fff7ed', // orange-50

  green: '#16a34a',
  greenDark: '#15803d',
  greenSoft: '#dcfce7',

  red: '#dc2626',
  redSoft: '#fee2e2',

  blue: '#2563eb',
  blueSoft: '#dbeafe',

  yellow: '#ca8a04',
  yellowSoft: '#fef9c3',

  bg: '#f8fafc', // slate-50
  card: '#ffffff',
  border: '#e2e8f0', // slate-200
  field: '#f1f5f9', // slate-100

  text: '#0f172a', // slate-900
  textMuted: '#64748b', // slate-500
  textOnPrimary: '#ffffff',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '900', color: colors.text },
  h2: { fontSize: 22, fontWeight: '800', color: colors.text },
  h3: { fontSize: 18, fontWeight: '800', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  muted: { fontSize: 13, color: colors.textMuted },
};
