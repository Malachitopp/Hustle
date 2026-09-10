import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDate, monthOf, type DateKey } from '@/core';
import { colors } from '@/theme';
import { BodyText, PixelText } from '@/ui/PixelText';

type Props = {
  value: DateKey | null;
  /** The earliest date that can be picked. Earlier dates are shown greyed out. */
  min: DateKey;
  onChange: (date: DateKey) => void;
};

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** A month grid to pick one date from, browsable forwards from the month of `min`. */
export function PixelDatePicker({ value, min, onChange }: Props) {
  const [browsing, setBrowsing] = useState<DateKey>(() => monthOf(value ?? min).first);
  const month = monthOf(browsing);
  const canGoBack = month.first > monthOf(min).first;

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <NavButton label="<" enabled={canGoBack} onPress={() => setBrowsing(month.previous)} />
        <PixelText style={styles.title}>{month.title}</PixelText>
        <NavButton label=">" enabled onPress={() => setBrowsing(month.next)} />
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((name, i) => (
          <PixelText key={i} style={styles.weekday}>
            {name}
          </PixelText>
        ))}
      </View>
      {month.weeks.map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((date, j) => {
            if (date === null) return <View key={j} style={styles.cell} />;
            const selected = date === value;
            const allowed = date >= min;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={formatDate(date)}
                accessibilityState={{ selected, disabled: !allowed }}
                disabled={!allowed}
                onPress={() => onChange(date)}
                style={[styles.cell, selected && styles.cellSelected]}
              >
                <BodyText style={[styles.day, !allowed && styles.dayPast, selected && styles.daySelected]}>
                  {Number(date.slice(-2))}
                </BodyText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function NavButton({ label, enabled, onPress }: { label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={8}
      style={styles.nav}
    >
      <PixelText style={[styles.navLabel, !enabled && styles.navDisabled]}>{label}</PixelText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 2,
    borderColor: colors.text,
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 10,
    lineHeight: 16,
  },
  nav: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  navDisabled: {
    color: colors.muted,
    opacity: 0.4,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 8,
    lineHeight: 12,
    color: colors.muted,
    marginBottom: 2,
  },
  cell: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: colors.yellow,
  },
  day: {
    fontSize: 20,
    lineHeight: 22,
  },
  dayPast: {
    color: colors.muted,
    opacity: 0.4,
  },
  daySelected: {
    color: colors.background,
  },
});
