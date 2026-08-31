import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Segmented } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'menaxher', label: 'Menaxher' },
  { value: 'kamarier', label: 'Kamarier' },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const [lloji, setLloji] = useState('admin');
  const [emri, setEmri] = useState('');
  const [password, setPassword] = useState('');
  const [kamarieret, setKamarieret] = useState([]);
  const [kamarierId, setKamarierId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setErr(null);
    if (lloji === 'kamarier') {
      api
        .getKamarieret()
        .then((data) => setKamarieret(Array.isArray(data) ? data : []))
        .catch(() => setKamarieret([]));
    }
  }, [lloji]);

  const submit = async () => {
    setErr(null);
    try {
      setBusy(true);
      if (lloji === 'kamarier') {
        if (!kamarierId || !password) throw new Error('Zgjidh kamarierin dhe fjalëkalimin.');
        await login({ lloji, punonjes_id: parseInt(kamarierId, 10), password });
      } else {
        if (!emri || !password) throw new Error('Plotëso emrin dhe fjalëkalimin.');
        await login({ lloji, emri_perdoruesit: emri, password });
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.wrap}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Ionicons name="restaurant" size={44} color="#fff" />
            <Text style={styles.brandText}>BitEat</Text>
          </View>

          <View style={styles.card}>
            <Text style={typography.label}>Lloji i përdoruesit</Text>
            <Segmented options={ROLES} value={lloji} onChange={setLloji} />

            {lloji === 'kamarier' ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={typography.label}>Kamarieri</Text>
                <View style={styles.chipWrap}>
                  {kamarieret.length === 0 ? (
                    <Text style={typography.muted}>Nuk u gjetën kamarierë.</Text>
                  ) : (
                    kamarieret.map((k) => {
                      const active = String(kamarierId) === String(k.punonjes_id);
                      return (
                        <Text
                          key={k.punonjes_id}
                          onPress={() => setKamarierId(k.punonjes_id)}
                          style={[styles.pick, active && styles.pickActive]}
                        >
                          {k.emri} {k.mbiemri || ''}
                        </Text>
                      );
                    })
                  )}
                </View>
              </View>
            ) : (
              <Field
                label="Emri"
                autoCapitalize="none"
                value={emri}
                onChangeText={setEmri}
                placeholder="p.sh. admin"
              />
            )}

            <Field
              label="Fjalëkalimi"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              onSubmitEditing={submit}
            />

            {err ? <Text style={styles.error}>{err}</Text> : null}

            <Button title="HYRJE" onPress={submit} loading={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.primary },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  brand: { alignItems: 'center', gap: spacing.sm },
  brandText: { fontSize: 40, fontWeight: '900', color: '#fff' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pick: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.border,
    fontWeight: '700',
    color: colors.text,
    overflow: 'hidden',
  },
  pickActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    color: '#fff',
  },
  error: { color: colors.red, fontWeight: '700' },
});
