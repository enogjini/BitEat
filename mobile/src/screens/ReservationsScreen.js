import React, { useState } from 'react';
import { Alert, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Pill,
  Screen,
  SectionTitle,
} from '../components/ui';
import { colors, spacing, typography } from '../theme';

const todayISO = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  emri_klientit: '',
  numri_personave: '',
  data_rezervimit: todayISO(),
  ora_rezervimit: '',
  tavoline_id: '',
  numri_telefonit: '',
  shenim: '',
};

const statusTone = (s) =>
  s === 'E konfirmuar' ? 'green' : s === 'E anuluar' ? 'red' : 'yellow';

export default function ReservationsScreen() {
  const { isWaiter } = useAuth();
  const { data, error, loading, refreshing, refresh, reload } = useApi(
    () => api.getRezervimet(),
    []
  );
  const tables = useApi(() => api.getTavolinat(), []);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (
      !form.emri_klientit ||
      !form.numri_personave ||
      !form.data_rezervimit ||
      !form.ora_rezervimit
    ) {
      return Alert.alert('Mungojnë të dhëna', 'Plotëso emrin, personat, datën dhe orën.');
    }
    try {
      setSaving(true);
      const res = await api.createRezervim({
        ...form,
        numri_personave: parseInt(form.numri_personave, 10),
        tavoline_id: form.tavoline_id ? parseInt(form.tavoline_id, 10) : null,
      });
      if (!res?.success) throw new Error(res?.error || 'Nuk u ruajt');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await reload();
      Alert.alert('Sukses', 'Rezervimi u krijua.');
    } catch (e) {
      Alert.alert('Gabim', e.message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = (r) => {
    Alert.alert('Anulo rezervimin', `Anulo rezervimin e ${r.emri_klientit}?`, [
      { text: 'Jo', style: 'cancel' },
      {
        text: 'Po, anulo',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.setRezervimStatus(r.rezervim_id, 'E anuluar');
            await reload();
          } catch (e) {
            Alert.alert('Gabim', e.message);
          }
        },
      },
    ]);
  };

  if (loading) return <Screen scroll={false}><Loading /></Screen>;
  if (error)
    return (
      <Screen scroll={false}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.rowBetween}>
        <SectionTitle style={{ marginBottom: 0 }}>Rezervime</SectionTitle>
        {isWaiter ? (
          <Button
            title={showForm ? 'Mbyll' : '+ Krijo'}
            variant={showForm ? 'ghost' : 'primary'}
            onPress={() => setShowForm((s) => !s)}
          />
        ) : null}
      </View>

      {showForm ? (
        <Card style={{ backgroundColor: colors.primaryTint, borderColor: colors.primarySoft }}>
          <SectionTitle>Rezervim i Ri</SectionTitle>
          <Field label="Emri i klientit" value={form.emri_klientit} onChangeText={set('emri_klientit')} />
          <Field
            label="Numri i personave"
            keyboardType="numeric"
            value={form.numri_personave}
            onChangeText={set('numri_personave')}
          />
          <Field
            label="Data (VVVV-MM-DD)"
            value={form.data_rezervimit}
            onChangeText={set('data_rezervimit')}
            placeholder={todayISO()}
          />
          <Field
            label="Ora (OO:MM)"
            value={form.ora_rezervimit}
            onChangeText={set('ora_rezervimit')}
            placeholder="19:30"
          />
          <View style={{ gap: spacing.xs }}>
            <Text style={typography.label}>Tavolina (opsionale)</Text>
            <ChipRow
              items={tables.data || []}
              keyOf={(t) => t.tavoline_id}
              labelOf={(t) => `T${t.numri_tavolines}`}
              selected={form.tavoline_id}
              onSelect={set('tavoline_id')}
              allowClear
            />
          </View>
          <Field
            label="Telefon"
            keyboardType="phone-pad"
            value={form.numri_telefonit}
            onChangeText={set('numri_telefonit')}
          />
          <Field
            label="Shënim"
            value={form.shenim}
            onChangeText={set('shenim')}
            multiline
          />
          <Button title="RUAJ" variant="green" loading={saving} onPress={submit} />
        </Card>
      ) : null}

      {(data || []).length === 0 ? (
        <EmptyState text="Nuk ka rezervime të ardhshme" icon="📆" />
      ) : (
        (data || []).map((r) => (
          <Card key={r.rezervim_id}>
            <View style={styles.rowBetween}>
              <Text style={typography.h3}>{r.emri_klientit}</Text>
              <Pill text={r.statusi} tone={statusTone(r.statusi)} />
            </View>
            <Text style={typography.muted}>
              📅 {new Date(r.data_rezervimit).toLocaleDateString('sq-AL')} • 🕐{' '}
              {r.ora_rezervimit}
            </Text>
            <Text style={typography.muted}>
              👥 {r.numri_personave} persona
              {r.numri_tavolines ? ` • 🪑 Tavolina ${r.numri_tavolines}` : ''}
            </Text>
            {r.statusi === 'E konfirmuar' ? (
              <Button title="Anulo" variant="red" onPress={() => cancel(r)} />
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
