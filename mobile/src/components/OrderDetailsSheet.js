import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { Loading } from './ui';
import { colors, radius, spacing, typography } from '../theme';

// Bottom sheet showing the line items of a single order.
export default function OrderDetailsSheet({ porosiId, visible, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || !porosiId) return;
    setData(null);
    setError(null);
    api
      .getPorosi(porosiId)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [porosiId, visible]);

  const total =
    data?.artikujt?.reduce((s, a) => s + parseFloat(a.totali || 0), 0) || 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {!data && !error ? (
          <Loading />
        ) : error ? (
          <Text style={{ color: colors.red }}>{error}</Text>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={typography.h2}>Porosi #{data.porosi?.porosi_id}</Text>
              <Pressable onPress={onClose}>
                <Ionicons name="close" size={26} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={typography.muted}>
              Tavolina {data.porosi?.numri_tavolines} • {data.porosi?.kamarier}
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {data.artikujt?.map((a) => (
                <View key={a.artikull_porosie_id} style={styles.row}>
                  <Text style={typography.body}>
                    {a.emri} x{a.sasia}
                  </Text>
                  <Text style={{ fontWeight: '800' }}>{a.totali}L</Text>
                </View>
              ))}
            </View>
            <View style={styles.totalRow}>
              <Text style={typography.h3}>TOTAL</Text>
              <Text style={[typography.h2, { color: colors.primaryDark }]}>
                {total}L
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.field,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
});
