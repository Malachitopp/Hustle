import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  formatClockTime,
  formatDate,
  formatWorkTime,
  formatWorkTimeShort,
  monthOf,
  view,
  type DateKey,
  type DaySessionView,
  type DayView,
  type Span,
} from '@/core';
import { useMonthRestore } from '@/hooks/useMonthRestore';
import { useNow } from '@/hooks/useNow';
import { phoneTimeZone } from '@/phone';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { BodyText, PixelText } from '@/ui/PixelText';
import { PixelToggle } from '@/ui/PixelToggle';
import { Screen } from '@/ui/Screen';

const SPANS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const satisfies readonly { value: Span; label: string }[];

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export default function CalendarScreen() {
  const { state } = useStore();
  const [now] = useNow();
  const { calendar } = view(state, now, phoneTimeZone());

  const [span, setSpan] = useState<Span>('week');
  /** The first date of the month being browsed, or null for the current month. */
  const [browsing, setBrowsing] = useState<DateKey | null>(null);
  /** The date whose sessions are listed, or null for today while the current month is showing. */
  const [picked, setPicked] = useState<DateKey | null>(null);

  const thisMonth = monthOf(calendar.today);
  const month = browsing === null ? thisMonth : monthOf(browsing);
  // Sessions recorded on another phone in the month on show arrive as it is browsed to.
  useMonthRestore(month.first);
  const canGoBack = month.first > monthOf(calendar.firstDate).first;
  const canGoForward = month.first < thisMonth.first;
  const selected = picked ?? (month.first === thisMonth.first ? calendar.today : null);

  const browse = (first: DateKey) => {
    setBrowsing(first === thisMonth.first ? null : first);
    setPicked(null);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.totals}>
          <PixelText style={styles.totalsLabel}>Total worked this</PixelText>
          <PixelToggle options={SPANS} value={span} onChange={setSpan} />
          <PixelText style={styles.totalsValue}>{formatWorkTime(calendar.totals[span])}</PixelText>
        </View>

        <View style={styles.monthHeader}>
          <NavButton label="<" enabled={canGoBack} onPress={() => browse(month.previous)} />
          <PixelText style={styles.monthTitle}>{month.title}</PixelText>
          <NavButton label=">" enabled={canGoForward} onPress={() => browse(month.next)} />
        </View>

        <View>
          <View style={styles.week}>
            {WEEKDAYS.map((name, i) => (
              <PixelText key={i} style={styles.weekday}>
                {name}
              </PixelText>
            ))}
          </View>
          {month.weeks.map((week, i) => (
            <View key={i} style={styles.week}>
              {week.map((date, j) =>
                date === null ? (
                  <View key={j} style={styles.cell} />
                ) : (
                  <DayCell
                    key={date}
                    date={date}
                    workTime={calendar.days[date]?.workTime ?? 0}
                    isToday={date === calendar.today}
                    isSelected={date === selected}
                    onPress={() => setPicked(date)}
                  />
                ),
              )}
            </View>
          ))}
        </View>

        {selected === null ? (
          <BodyText style={styles.hint}>Tap a day to see its sessions.</BodyText>
        ) : (
          <DayDetail date={selected} day={calendar.days[selected]} />
        )}
      </ScrollView>
    </Screen>
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

type DayCellProps = {
  date: DateKey;
  workTime: number;
  isToday: boolean;
  isSelected: boolean;
  onPress: () => void;
};

function DayCell({ date, workTime, isToday, isSelected, onPress }: DayCellProps) {
  const dayOfMonth = Number(date.slice(-2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={formatDate(date)}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={[styles.cell, isToday && styles.cellToday, isSelected && styles.cellSelected]}
    >
      <BodyText style={[styles.cellDay, isSelected && styles.cellTextSelected]}>{dayOfMonth}</BodyText>
      {workTime > 0 ? (
        <BodyText style={[styles.cellWork, isSelected && styles.cellTextSelected]}>
          {formatWorkTimeShort(workTime)}
        </BodyText>
      ) : null}
    </Pressable>
  );
}

/** The sessions on one date, view only. */
function DayDetail({ date, day }: { date: DateKey; day: DayView | undefined }) {
  return (
    <View style={styles.day}>
      <PixelText style={styles.dayTitle}>{formatDate(date)}</PixelText>
      {!day || day.sessions.length === 0 ? (
        <BodyText style={styles.hint}>No work on this day.</BodyText>
      ) : (
        <>
          {day.sessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
          <View style={[styles.sessionRow, styles.dayTotal]}>
            <BodyText>Total</BodyText>
            <BodyText style={styles.sessionWork}>{formatWorkTime(day.workTime)}</BodyText>
          </View>
        </>
      )}
    </View>
  );
}

function SessionRow({ session }: { session: DaySessionView }) {
  const { timeZone } = session;
  const from = formatClockTime(session.startedAt, timeZone);
  const to = session.endedAt === null ? session.status : formatClockTime(session.endedAt, timeZone);
  return (
    <View style={styles.sessionRow}>
      <BodyText>
        {from} – {to}
      </BodyText>
      <BodyText style={styles.sessionWork}>{formatWorkTime(session.workTime)}</BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    paddingBottom: 24,
    gap: 20,
  },
  totals: {
    alignItems: 'center',
    gap: 12,
  },
  totalsLabel: {
    fontSize: 10,
    lineHeight: 16,
    color: colors.muted,
  },
  totalsValue: {
    fontSize: 22,
    lineHeight: 30,
    color: colors.yellow,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitle: {
    fontSize: 11,
    lineHeight: 18,
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
    marginBottom: 4,
  },
  cell: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellToday: {
    borderColor: colors.text,
  },
  cellSelected: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  cellDay: {
    fontSize: 18,
    lineHeight: 20,
  },
  cellWork: {
    fontSize: 14,
    lineHeight: 15,
    color: colors.yellow,
  },
  cellTextSelected: {
    color: colors.background,
  },
  day: {
    gap: 6,
  },
  dayTitle: {
    fontSize: 10,
    lineHeight: 16,
    color: colors.yellow,
    marginBottom: 4,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sessionWork: {
    color: colors.yellow,
  },
  dayTotal: {
    borderTopWidth: 2,
    borderTopColor: colors.muted,
    paddingTop: 6,
    marginTop: 2,
  },
  hint: {
    color: colors.muted,
    textAlign: 'center',
  },
});
