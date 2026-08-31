import React from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Bar,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Pill,
  Screen,
  SectionTitle,
} from '../components/ui';
import { colors, spacing, typography } from '../theme';

const money = (v) => `${parseFloat(v || 0).toFixed(0)}L`;
const dateAl = (d) => {
  try {
    return new Date(d).toLocaleDateString('sq-AL');
  } catch {
    return String(d);
  }
};

export default function StatistikaScreen() {
  const stats = useApi(
    () =>
      Promise.all([
        api.statDitaMeFitim(),
        api.statFluksiOra(),
        api.statKamarieriMeIMire(),
        api.statXhiroTrendet(),
      ]).then(([dita, fluksi, kamarieret, trendet]) => ({
        dita,
        fluksi,
        kamarieret,
        trendet,
      })),
    []
  );

  if (stats.loading) return <Screen scroll={false}><Loading /></Screen>;
  if (stats.error)
    return (
      <Screen scroll={false}>
        <ErrorState message={stats.error} onRetry={stats.reload} />
      </Screen>
    );

  const { dita = [], fluksi = [], kamarieret = [], trendet = [] } = stats.data || {};
  const maxDita = Math.max(1, ...dita.map((d) => parseFloat(d.xhiro_totale || 0)));
  const maxFluksi = Math.max(1, ...fluksi.map((f) => f.numri_porosive || 0));
  const maxKam = Math.max(1, ...kamarieret.map((k) => parseFloat(k.xhiro_totale || 0)));

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={stats.refreshing} onRefresh={stats.refresh} />
      }
    >
      <Card>
        <SectionTitle>💰 Ditët më Fitimprurëse</SectionTitle>
        {dita.length === 0 ? (
          <EmptyState icon="📅" />
        ) : (
          dita.slice(0, 10).map((d, i) => (
            <View key={i} style={styles.barRow}>
              <View style={styles.barLabelCol}>
                <Text style={styles.smallBold}>{dateAl(d.data)}</Text>
                <Text style={typography.muted}>{d.numri_porosive} porosi</Text>
              </View>
              <Bar
                ratio={parseFloat(d.xhiro_totale || 0) / maxDita}
                color={colors.green}
                label={money(d.xhiro_totale)}
              />
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>🕐 Fluksi Sipas Orëve</SectionTitle>
        {fluksi.length === 0 ? (
          <EmptyState icon="⏱️" />
        ) : (
          fluksi.map((f, i) => {
            const rush = f.statusi_aktivitetit?.includes('RUSH');
            const qete = f.statusi_aktivitetit?.includes('QETË');
            return (
              <View key={i} style={styles.barRow}>
                <Text style={[styles.smallBold, { width: 56 }]}>
                  {f.intervali_kohor}
                </Text>
                <Bar
                  ratio={(f.numri_porosive || 0) / maxFluksi}
                  color={rush ? colors.red : qete ? colors.blue : colors.textMuted}
                  label={String(f.numri_porosive)}
                  height={22}
                />
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <SectionTitle>🏆 Top Kamarierë</SectionTitle>
        {kamarieret.length === 0 ? (
          <EmptyState icon="🧑‍🍳" />
        ) : (
          kamarieret.slice(0, 10).map((k, i) => (
            <View key={k.punonjes_id || i} style={{ gap: spacing.xs }}>
              <View style={styles.rowBetween}>
                <Text style={styles.smallBold}>
                  {i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`} {k.emri}{' '}
                  {k.mbiemri || ''}
                </Text>
                <Text style={typography.muted}>{k.numri_porosive} porosi</Text>
              </View>
              <Bar
                ratio={parseFloat(k.xhiro_totale || 0) / maxKam}
                label={money(k.xhiro_totale)}
              />
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>📊 Trendet e Xhiros</SectionTitle>
        {trendet.length === 0 ? (
          <EmptyState icon="📉" />
        ) : (
          trendet.slice(0, 15).map((t, i) => (
            <View key={i} style={styles.rowBetween}>
              <Text style={styles.smallBold}>{dateAl(t.data)}</Text>
              <Text style={{ fontWeight: '800', color: colors.green }}>
                {money(t.xhiro_ditore)}
              </Text>
              <Pill
                text={`${t.ndryshimi_perqindor > 0 ? '+' : ''}${t.ndryshimi_perqindor}%`}
                tone={t.ndryshimi_perqindor > 0 ? 'green' : 'red'}
              />
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  barLabelCol: { width: 96 },
  smallBold: { fontSize: 13, fontWeight: '800', color: colors.text },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
});
