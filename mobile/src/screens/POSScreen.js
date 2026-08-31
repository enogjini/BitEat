import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  SectionTitle,
} from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

export default function POSScreen() {
  const { perdoruesi } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tavolinat, setTavolinat] = useState([]);
  const [kategorite, setKategorite] = useState([]);
  const [menu, setMenu] = useState([]);

  const [tavolineId, setTavolineId] = useState('');
  const [kategoriId, setKategoriId] = useState('');
  const [cart, setCart] = useState([]); // {artikull_id, emri, cmimi, sasia}
  const [saving, setSaving] = useState(false);

  const loadRef = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, k] = await Promise.all([api.getTavolinat(), api.getKategorite()]);
      setTavolinat(t || []);
      setKategorite(k || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRef();
  }, []);

  useEffect(() => {
    api
      .getMenu(kategoriId || undefined)
      .then((data) => setMenu(data || []))
      .catch(() => setMenu([]));
  }, [kategoriId]);

  const addToCart = (item) => {
    setCart((prev) => {
      const found = prev.find((i) => i.artikull_id === item.artikull_id);
      if (found) {
        return prev.map((i) =>
          i.artikull_id === item.artikull_id ? { ...i, sasia: i.sasia + 1 } : i
        );
      }
      return [
        ...prev,
        {
          artikull_id: item.artikull_id,
          emri: item.emri,
          cmimi: Number(item.cmimi),
          sasia: 1,
        },
      ];
    });
  };

  const changeQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((i) => (i.artikull_id === id ? { ...i, sasia: i.sasia + delta } : i))
        .filter((i) => i.sasia > 0)
    );
  };

  const total = useMemo(
    () => cart.reduce((s, i) => s + i.cmimi * i.sasia, 0),
    [cart]
  );

  const save = async () => {
    if (!tavolineId) return Alert.alert('Mungon tavolina', 'Zgjidh një tavolinë.');
    if (cart.length === 0) return Alert.alert('Shporta bosh', 'Shto të paktën një artikull.');
    try {
      setSaving(true);
      const res = await api.createPorosi({
        tavoline_id: parseInt(tavolineId, 10),
        punonjes_id: parseInt(perdoruesi.punonjes_id, 10),
        artikujt: cart.map((i) => ({ artikull_id: i.artikull_id, sasia: i.sasia })),
      });
      if (!res?.success) throw new Error(res?.error || 'Nuk u ruajt');
      Alert.alert('Sukses', 'Porosia u ruajt.');
      setCart([]);
      setTavolineId('');
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
        <ErrorState message={error} onRetry={loadRef} />
      </Screen>
    );

  return (
    <Screen>
      <Card>
        <SectionTitle>Tavolina</SectionTitle>
        <ChipRow
          items={tavolinat}
          keyOf={(t) => t.tavoline_id}
          labelOf={(t) => `Tavolina ${t.numri_tavolines}`}
          selected={tavolineId}
          onSelect={setTavolineId}
        />
      </Card>

      <Card>
        <SectionTitle>Menu</SectionTitle>
        <ChipRow
          items={kategorite}
          keyOf={(k) => k.kategori_id}
          labelOf={(k) => k.emri}
          selected={kategoriId}
          onSelect={setKategoriId}
          allowClear
        />
        {menu.length === 0 ? (
          <EmptyState text="Nuk ka artikuj" icon="🍽️" />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {menu.map((item) => (
              <Pressable
                key={item.artikull_id}
                onPress={() => addToCart(item)}
                style={styles.menuRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuName}>{item.emri}</Text>
                  <Text style={typography.muted}>{Number(item.cmimi)}L</Text>
                </View>
                <Ionicons name="add-circle" size={28} color={colors.green} />
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      <Card style={{ backgroundColor: colors.primaryTint, borderColor: colors.primarySoft }}>
        <SectionTitle>
          <Ionicons name="cart" size={18} /> Shporta
        </SectionTitle>
        {cart.length === 0 ? (
          <Text style={typography.muted}>Prek një artikull për ta shtuar.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {cart.map((i) => (
              <View key={i.artikull_id} style={styles.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuName}>{i.emri}</Text>
                  <Text style={typography.muted}>
                    {i.sasia} x {i.cmimi}L = {i.cmimi * i.sasia}L
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => changeQty(i.artikull_id, -1)} style={styles.stepBtn}>
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </Pressable>
                  <Text style={styles.stepQty}>{i.sasia}</Text>
                  <Pressable onPress={() => changeQty(i.artikull_id, 1)} style={styles.stepBtn}>
                    <Ionicons name="add" size={18} color={colors.text} />
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={typography.h3}>TOTALI</Text>
              <Text style={[typography.h2, { color: colors.primaryDark }]}>{total}L</Text>
            </View>
            <Button title="RUAJ POROSINË" variant="green" onPress={save} loading={saving} />
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.field,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  menuName: { fontSize: 15, fontWeight: '800', color: colors.text },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.field,
    borderRadius: radius.pill,
    padding: 4,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepQty: { fontWeight: '900', fontSize: 15, minWidth: 20, textAlign: 'center' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.primarySoft,
    paddingTop: spacing.md,
  },
});
