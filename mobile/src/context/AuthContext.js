import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const STORAGE_KEY = 'biteat.user';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [perdoruesi, setPerdoruesi] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setPerdoruesi(JSON.parse(raw));
      } catch {
        // ignore corrupt storage
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (credentials) => {
    // credentials: { lloji, emri_perdoruesit?, punonjes_id?, password }
    const data = await api.login(credentials);
    if (!data?.success) {
      throw new Error(data?.message || 'Kredencialet gabim!');
    }
    const user = { ...data.user, lloji: credentials.lloji };
    setPerdoruesi(user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return user;
  };

  const logout = async () => {
    setPerdoruesi(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      perdoruesi,
      loading,
      login,
      logout,
      isStaff:
        perdoruesi?.lloji === 'admin' || perdoruesi?.lloji === 'menaxher',
      isWaiter: perdoruesi?.lloji === 'kamarier',
    }),
    [perdoruesi, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
