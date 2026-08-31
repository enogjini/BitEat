import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme';

export function Screen({ children, scroll = true, refreshControl, contentStyle }) {
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.screenContent, contentStyle]}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, { flex: 1 }, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      {inner}
    </SafeAreaView>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, style }) {
  return <Text style={[typography.h3, styles.sectionTitle, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.textOnPrimary },
    green: { bg: colors.green, fg: '#fff' },
    red: { bg: colors.red, fg: '#fff' },
    blue: { bg: colors.blue, fg: '#fff' },
    ghost: { bg: colors.field, fg: colors.text },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, style, ...props }) {
  return (
    <View style={[{ gap: spacing.xs }, style]}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function Pill({ text, tone = 'neutral' }) {
  const map = {
    neutral: { bg: colors.field, fg: colors.textMuted },
    green: { bg: colors.greenSoft, fg: colors.greenDark },
    red: { bg: colors.redSoft, fg: colors.red },
    yellow: { bg: colors.yellowSoft, fg: colors.yellow },
    orange: { bg: colors.primarySoft, fg: colors.primaryDark },
    blue: { bg: colors.blueSoft, fg: colors.blue },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      <Text style={[styles.pillText, { color: map.fg }]}>{text}</Text>
    </View>
  );
}

export function Loading({ label = 'Duke ngarkuar...' }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[typography.muted, { marginTop: spacing.md }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ text = 'Nuk ka të dhëna', icon = '📭' }) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <Text style={[typography.muted, { marginTop: spacing.sm }]}>{text}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 40 }}>⚠️</Text>
      <Text
        style={[typography.body, { textAlign: 'center', marginVertical: spacing.md }]}
      >
        {message}
      </Text>
      {onRetry ? <Button title="Provo përsëri" onPress={onRetry} /> : null}
    </View>
  );
}

// Lightweight segmented control used for role picker / dashboard tabs.
export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Minimal picker: a horizontal scroll of chips (works well for tables/categories).
export function ChipRow({ items, keyOf, labelOf, selected, onSelect, allowClear }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
    >
      {allowClear ? (
        <Chip
          label="Të gjitha"
          active={selected == null || selected === ''}
          onPress={() => onSelect('')}
        />
      ) : null}
      {items.map((it) => {
        const k = keyOf(it);
        return (
          <Chip
            key={String(k)}
            label={labelOf(it)}
            active={String(selected) === String(k)}
            onPress={() => onSelect(k)}
          />
        );
      })}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// Horizontal progress bar for statistics.
export function Bar({ ratio, color = colors.primary, height = 28, label }) {
  return (
    <View style={[styles.barTrack, { height }]}>
      <View
        style={[
          styles.barFill,
          { width: `${Math.max(4, Math.min(100, ratio * 100))}%`, backgroundColor: color },
        ]}
      >
        {label ? <Text style={styles.barLabel}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { marginBottom: spacing.xs },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { fontSize: 15, fontWeight: '800' },
  input: {
    backgroundColor: colors.field,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12, fontWeight: '800' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.field,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 13, fontWeight: '800', color: colors.textMuted },
  segmentTextActive: { color: colors.textOnPrimary },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  chipTextActive: { color: colors.textOnPrimary },
  barTrack: {
    flex: 1,
    backgroundColor: colors.field,
    borderRadius: radius.pill,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    minWidth: 40,
  },
  barLabel: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
