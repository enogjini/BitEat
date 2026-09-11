import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/**
 * Theme state for the web client.
 *
 * Three modes: 'light', 'dark', and 'system' (follows the OS setting and keeps
 * following it if the user changes it while the app is open). The choice is
 * persisted in localStorage under the same key the inline bootstrap script in
 * public/index.html reads — keep the two in sync.
 */

const STORAGE_KEY = 'biteat-theme';
const MODES = ['light', 'dark', 'system'];

const ThemeContext = createContext(null);

const darkQuery = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function readStoredMode() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return MODES.includes(stored) ? stored : 'system';
  } catch {
    // Private browsing or blocked storage — behave as if nothing was saved.
    return 'system';
  }
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(readStoredMode);
  const [systemIsDark, setSystemIsDark] = useState(() => !!darkQuery()?.matches);

  // Track the OS preference so 'system' stays live.
  useEffect(() => {
    const mq = darkQuery();
    if (!mq) return undefined;

    const onChange = (event) => setSystemIsDark(event.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    // Safari < 14
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const resolved = mode === 'system' ? (systemIsDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute(
        'content',
        resolved === 'dark' ? '#0b1220' : '#f8fafc'
      );
    }

    try {
      // 'system' is stored explicitly so the bootstrap script can tell
      // "follow the OS" apart from "never chose".
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* storage unavailable — the theme still applies for this session */
    }
  }, [mode, resolved]);

  const cycleMode = useCallback(() => {
    setMode((current) => MODES[(MODES.indexOf(current) + 1) % MODES.length]);
  }, []);

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycleMode, isDark: resolved === 'dark' }),
    [mode, resolved, cycleMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside a <ThemeProvider>');
  }
  return context;
}

export { STORAGE_KEY, MODES };
