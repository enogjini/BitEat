import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import OrderDetailsSheet from '../components/OrderDetailsSheet';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Pill,
  Screen,
  SectionTitle,
  Segmented,
} from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

const METHODS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Kartë', label: 'Kartë' },
  { value: 'Transferim', label: 'Transferim' },
];

const statusTone = (s) =>
  s === 'E Hapur' ? 'yellow' : s === 'E Mbyllur' ? 'green' : 'neutral';

export default function OrdersScreen() {
  const { perdoruesi, isWaiter } = useAuth();

  const query = isWaiter
    ? { punonjes_id: perdoruesi.punonjes_id, statusi: 'E Hapur' }
    : undefined;

  const { data, error, loading, refreshing, refresh, reload } = useApi(
    () => api.getPorosite(query),
    [isWaiter, perdoruesi?.punonjes_id]
  );

  const [detailId, setDetailId] = useState(null);
  const [payment, setPayment] = useState(null); // { tavolineId, orderIds, amount }
  const [method, setMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);

  const porosite = data || [];

  const tableGroups = useMemo(() => {
    const map = new Map();
    for (const p of porosite) {
      if (p.statusi_porosise !== 'E Hapur') continue;
      const key = p.tavoline_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return Array.from(map.entries());
  }, [porosite]);

  const startPayment = async (tavolineId, orders) => {
    try {
      let amount = 0;
      for (const o of orders) {
        const d = await api.getPorosi(o.porosi_id);
        amount += (d.artikujt || []).reduce(
          (s, a) => s + parseFloat(a.totali || 0),
          0
        );
      }
      setMethod('Cash');
      setPayment({
        tavolineId,
        orderIds: orders.map((o) => o.porosi_id),
        amount: Math.round(amount * 100) / 100,
      });
    } catch (e) {
      Alert.alert('Gabim', e.message);
    }
  };

  const confirmPayment = async () => {
    if (!payment) return;
    try {
      setSaving(true);
      const res = await api.createPagese({
        porosi_id: payment.orderIds[0],
        shuma: payment.amount,
        metoda_pageses: method,
        ora_pageses: new Date().toISOString(),
      });
      if (!res?.success) throw new Error(res?.error || 'Pagesa dështoi');
      for (const id of payment.orderIds) {
        await api.setPorosiStatus(id, 'E Mbyllur');
      }
      setPayment(null);
      await reload();
      Alert.alert('Sukses', `Tavolina u mbyll.\nPagesa: ${payment.amount}L (${method})`);
    } catch (e) {
      Alert.alert('Gabim', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Screen scroll={false}><Loading /></Screen>;
  if (error)
    return (
      <Screen scroll={false}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );

  const rc = <RefreshControl refreshing={refreshing} onRefresh={refresh} />;

  // ---- Waiter view: my open tables ----
  if (isWaiter) {
    return (
      <Screen refreshControl={rc}>
        <SectionTitle>Tavolinat e Mia</SectionTitle>
        {tableGroups.length === 0 ? (
          <EmptyState text="Nuk ke tavolina të hapura" icon="🪑" />
        ) : (
          tableGroups.map(([tavolineId, orders]) => (
            <Card key={tavolineId}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={typography.h3}>
                    Tavolina {orders[0].numri_tavolines}
                  </Text>
                  <Text style={typography.muted}>
                    {orders.length} porosi aktive
                  </Text>
                </View>
                <Pill text="E Hapur" tone="yellow" />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  title="Detajet"
                  variant="blue"
                  style={{ flex: 1 }}
                  onPress={() => setDetailId(orders[0].porosi_id)}
                />
                <Button
                  title="Mbyll & Paguaj"
                  variant="green"
                  style={{ flex: 1 }}
                  onPress={() => startPayment(tavolineId, orders)}
                />
              </View>
            </Card>
          ))
        )}

        <OrderDetailsSheet
          porosiId={detailId}
          visible={detailId != null}
          onClose={() => setDetailId(null)}
        />
        <PaymentModal
          payment={payment}
          method={method}
          setMethod={setMethod}
          saving={saving}
          onCancel={() => setPayment(null)}
          onConfirm={confirmPayment}
        />
      </Screen>
    );
  }

  // ---- Staff view: order history ----
  return (
    <Screen refreshControl={rc}>
      <SectionTitle>Historiku i Porosive</SectionTitle>
      {porosite.length === 0 ? (
        <EmptyState icon="🧾" />
      ) : (
        porosite.map((p) => (
          <Card key={p.porosi_id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>
                  #{p.porosi_id} • Tavolina {p.numri_tavolines}
                </Text>
                <Text style={typography.muted}>{p.kamarier}</Text>
                <View style={{ marginTop: spacing.xs }}>
                  <Pill
                    text={p.statusi_porosise}
                    tone={statusTone(p.statusi_porosise)}
                  />
                </View>
              </View>
              <Pressable
                onPress={() => setDetailId(p.porosi_id)}
                style={styles.iconBtn}
              >
                <Ionicons name="eye" size={20} color="#fff" />
              </Pressable>
            </View>
          </Card>
        ))
      )}
      <OrderDetailsSheet
        porosiId={detailId}
        visible={detailId != null}
        onClose={() => setDetailId(null)}
      />
    </Screen>
  );
}

function PaymentModal({ payment, method, setMethod, saving, onCancel, onConfirm }) {
  return (
    <Modal
      visible={payment != null}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.centerBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.rowBetween}>
            <Text style={typography.h2}>Pagesa</Text>
            <Pressable onPress={onCancel}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={typography.label}>Metoda e pagesës</Text>
          <Segmented options={METHODS} value={method} onChange={setMethod} />

          <View style={styles.amountBox}>
            <Text style={typography.muted}>Totali për pagesë</Text>
            <Text style={[typography.h1, { color: colors.primaryDark }]}>
              {payment ? payment.amount.toFixed(2) : '0.00'}L
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              title="ANULO"
              variant="ghost"
              style={{ flex: 1 }}
              onPress={onCancel}
            />
            <Button
              title="KONFIRMO"
              variant="green"
              style={{ flex: 1 }}
              loading={saving}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBtn: {
    backgroundColor: colors.blue,
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  amountBox: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.lg,
  },
});
