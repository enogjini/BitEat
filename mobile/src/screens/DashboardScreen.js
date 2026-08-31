import React, { useState } from 'react';
import { Alert, Modal, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Pill,
  Screen,
  Segmented,
} from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

const TABS = [
  { value: 'xhiro', label: 'Xhiro' },
  { value: 'produktet', label: 'Produktet' },
  { value: 'inventar', label: 'Inventari' },
];

export default function DashboardScreen() {
  const [tab, setTab] = useState('xhiro');
  return (
    <Screen scroll={false} contentStyle={{ paddingBottom: 0 }}>
      <Segmented options={TABS} value={tab} onChange={setTab} />
      <View style={{ flex: 1, marginTop: spacing.lg }}>
        {tab === 'xhiro' && <XhiroTab />}
        {tab === 'produktet' && <ProduktetTab />}
        {tab === 'inventar' && <InventarTab />}
      </View>
    </Screen>
  );
}

function TabScroll({ children, refreshing, onRefresh }) {
  return (
    <Screen
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
      contentStyle={{ padding: 0, paddingBottom: spacing.xxl }}
    >
      {children}
    </Screen>
  );
}

function XhiroTab() {
  const { data, error, loading, refreshing, refresh, reload } = useApi(
    () => api.statXhiroDitore(),
    []
  );
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const cards = [
    { icon: 'stats-chart', color: colors.primary, label: 'Xhiro Ditore', value: `${data?.xhiro_totale || 0}L` },
    { icon: 'cart', color: colors.green, label: 'Porosi', value: data?.numri_porosive || 0 },
    { icon: 'cube', color: colors.blue, label: 'Produkte', value: data?.totali_produkteve || 0 },
  ];

  return (
    <TabScroll refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: spacing.md }}>
        {cards.map((c) => (
          <Card key={c.label} style={styles.statCard}>
            <Ionicons name={c.icon} size={36} color={c.color} />
            <View>
              <Text style={typography.muted}>{c.label}</Text>
              <Text style={typography.h1}>{c.value}</Text>
            </View>
          </Card>
        ))}
      </View>
    </TabScroll>
  );
}

function ProduktetTab() {
  const [scope, setScope] = useState('sot');
  const { data, error, loading, refreshing, refresh, reload } = useApi(
    () =>
      scope === 'sot'
        ? api.statProduktetSot()
        : api.statProduktetTeGjitha(),
    [scope]
  );

  return (
    <TabScroll refreshing={refreshing} onRefresh={refresh}>
      <Segmented
        options={[
          { value: 'sot', label: 'Sot' },
          { value: 'te-gjitha', label: 'Gjithë kohës' },
        ]}
        value={scope}
        onChange={setScope}
        style={{ marginBottom: spacing.md }}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="📈" />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {data.map((p, idx) => (
            <Card key={idx} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>{p.emri}</Text>
                <Text style={typography.muted}>Çmimi: {p.cmimi_aktual}L</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: '800' }}>{p.totali_shitur} copë</Text>
                <Text style={{ color: colors.primaryDark, fontWeight: '900' }}>
                  {parseFloat(p.xhiro_totale || 0).toFixed(2)}L
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </TabScroll>
  );
}

function stockTone(status = '') {
  if (status.includes('PA STOK')) return 'red';
  if (status.includes('KRITIK')) return 'orange';
  if (status.includes('ULËT')) return 'yellow';
  return 'green';
}

function InventarTab() {
  const { data, error, loading, refreshing, refresh, reload } = useApi(
    () => api.getInventar(),
    []
  );
  const [target, setTarget] = useState(null); // inventory item being restocked
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return Alert.alert('Vlerë e pavlefshme', 'Fut një numër pozitiv.');
    try {
      setSaving(true);
      await api.addStock(target.inventar_id, n);
      setTarget(null);
      setAmount('');
      await reload();
    } catch (e) {
      Alert.alert('Gabim', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <TabScroll refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: spacing.sm }}>
        {(data || []).map((i) => (
          <Card key={i.inventar_id} style={{ gap: spacing.sm }}>
            <View style={styles.rowBetween}>
              <Text style={typography.h3}>{i.emri_pijes}</Text>
              <Pill text={i.statusi_stokut || 'NORMAL'} tone={stockTone(i.statusi_stokut)} />
            </View>
            <Text style={typography.muted}>
              📦 Stoku: {i.stoku_aktual} {i.njesia} • ⚠️ Min: {i.stoku_minimal}{' '}
              {i.njesia}
            </Text>
            {i.cmimi_per_njesi ? (
              <Text style={typography.muted}>
                💰 {i.cmimi_per_njesi}L/{i.njesia} • 💵 Vlera:{' '}
                {parseFloat(i.vlera_totale_stoku || 0).toFixed(2)}L
              </Text>
            ) : null}
            <Button
              title={`+ Shto ${i.njesia}`}
              variant="green"
              onPress={() => {
                setAmount('');
                setTarget(i);
              }}
            />
          </Card>
        ))}
      </View>

      <Modal
        visible={target != null}
        transparent
        animationType="fade"
        onRequestClose={() => setTarget(null)}
      >
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={typography.h3}>Shto stok</Text>
            <Text style={typography.muted}>
              {target?.emri_pijes} — sa {target?.njesia}?
            </Text>
            <Field
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                title="Anulo"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => setTarget(null)}
              />
              <Button
                title="Shto"
                variant="green"
                style={{ flex: 1 }}
                loading={saving}
                onPress={submit}
              />
            </View>
          </View>
        </View>
      </Modal>
    </TabScroll>
  );
}

const styles = StyleSheet.create({
  statCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  promptCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
});
