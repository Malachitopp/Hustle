import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  formatShortDate,
  formatWorkTimeShort,
  view,
  type DateKey,
  type GoalStatus,
  type GoalView,
} from '@/core';
import { useNow } from '@/hooks/useNow';
import { newId, phoneTimeZone } from '@/phone';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { PixelBar } from '@/ui/PixelBar';
import { PixelButton } from '@/ui/PixelButton';
import { PixelConfetti } from '@/ui/PixelConfetti';
import { PixelDatePicker } from '@/ui/PixelDatePicker';
import { PixelDialog } from '@/ui/PixelDialog';
import { PixelInput } from '@/ui/PixelInput';
import { BodyText, PixelText } from '@/ui/PixelText';
import { PixelSprite } from '@/ui/PixelSprite';
import { Screen } from '@/ui/Screen';

const HOUR = 60 * 60_000;

const DOWN_ARROW = ['#######', '.#####.', '..###..', '...#...'];

export default function GoalsScreen() {
  const { state, act } = useStore();
  const [now, wakeAt] = useNow();
  const timeZone = phoneTimeZone();
  const { goals, calendar } = view(state, now, timeZone);
  const focused = useIsFocused();

  /** Counts the times the form has been opened, so each opening starts from a blank form. */
  const [formOpening, setFormOpening] = useState(0);
  const [creating, setCreating] = useState(false);
  /** Where the switch dropdown hangs from, or null while it is closed. */
  const [dropdown, setDropdown] = useState<{ top: number; right: number } | null>(null);
  const switchButton = useRef<View>(null);
  const { width } = useWindowDimensions();

  // Refresh at the exact moment a goal is achieved, not just at the next minute.
  const nextAchievement = goals.reduce<number | null>(
    (soonest, goal) =>
      goal.achievesAt !== null && (soonest === null || goal.achievesAt < soonest) ? goal.achievesAt : soonest,
    null,
  );
  useEffect(() => {
    wakeAt(nextAchievement);
  }, [nextAchievement, wakeAt]);

  const inProgress = goals.filter((goal) => goal.status === 'active' || goal.status === 'dormant');

  // One celebration at a time, only while this tab is showing with nothing open over it.
  const toCelebrate =
    focused && !creating && dropdown === null
      ? (goals.find((goal) => goal.status === 'achieved' && goal.celebratedAt === null) ?? null)
      : null;

  const openForm = () => {
    setFormOpening((count) => count + 1);
    setCreating(true);
  };

  const openDropdown = () => {
    switchButton.current?.measureInWindow((x, y, w, h) => {
      setDropdown({ top: y + h + 6, right: Math.max(0, width - x - w) });
    });
  };

  const createGoal = (details: GoalDetails) => {
    setCreating(false);
    act({ type: 'create-goal', goalId: newId(), timeZone, ...details });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <PixelText style={styles.title}>Goals</PixelText>
        {inProgress.length > 0 ? (
          <View ref={switchButton} collapsable={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch goals on and off"
              onPress={openDropdown}
              style={styles.switchButton}
            >
              <PixelText style={styles.switchLabel}>Active</PixelText>
              <PixelSprite rows={DOWN_ARROW} color={colors.text} scale={2} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {goals.length === 0 ? (
        <View style={styles.empty}>
          <PixelText style={styles.emptyTitle}>No goals yet</PixelText>
          <BodyText style={styles.hint}>
            A goal is an amount of work to reach by a date, like 100h by 24 Oct. Only work done while the goal is
            switched on counts.
          </BodyText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} today={calendar.today} />
          ))}
        </ScrollView>
      )}

      <View style={styles.actions}>
        <PixelButton label="New goal" variant="primary" onPress={openForm} />
      </View>

      <SwitchDropdown
        anchor={dropdown}
        goals={inProgress}
        onSwitch={(goalId, active) => act({ type: 'switch-goal', goalId, active })}
        onClose={() => setDropdown(null)}
      />

      <GoalForm
        key={formOpening}
        visible={creating}
        today={calendar.today}
        onCancel={() => setCreating(false)}
        onCreate={createGoal}
      />

      <PixelDialog
        visible={toCelebrate !== null}
        title="Goal achieved!"
        message={toCelebrate ? describe(toCelebrate, calendar.today) : undefined}
        actions={[
          {
            label: 'Nice!',
            variant: 'primary',
            onPress: () => {
              if (toCelebrate) act({ type: 'celebrate-goal', goalId: toCelebrate.id });
            },
          },
        ]}
        decoration={<PixelConfetti height={260} />}
      />
    </Screen>
  );
}

/** e.g. "Finals · 100h by 24 Oct". */
function describe(goal: GoalView, today: DateKey): string {
  return `${goal.name} · ${formatWorkTimeShort(goal.target)} by ${formatShortDate(goal.deadline, today)}`;
}

const STATUS_TAGS: Record<GoalStatus, { label: string; color: string } | null> = {
  active: null,
  dormant: { label: 'Dormant', color: colors.muted },
  achieved: { label: 'Achieved', color: colors.yellow },
  missed: { label: 'Missed', color: colors.red },
};

/** One goal: its name, progress bar, work time against the target, and deadline. */
function GoalCard({ goal, today }: { goal: GoalView; today: DateKey }) {
  const tag = STATUS_TAGS[goal.status];
  return (
    <View style={[styles.card, goal.status === 'dormant' && styles.cardFaded]}>
      <View style={styles.cardHeader}>
        <PixelText style={styles.goalName} numberOfLines={2}>
          {goal.name}
        </PixelText>
        {tag ? <PixelText style={[styles.tag, { color: tag.color }]}>{tag.label}</PixelText> : null}
      </View>
      <PixelBar
        fraction={goal.workTime / goal.target}
        color={goal.status === 'missed' ? colors.muted : colors.yellow}
      />
      <View style={styles.cardFooter}>
        <BodyText style={styles.progress}>
          {formatWorkTimeShort(goal.workTime)} / {formatWorkTimeShort(goal.target)}
        </BodyText>
        <BodyText style={styles.deadline}>by {formatShortDate(goal.deadline, today)}</BodyText>
      </View>
    </View>
  );
}

type SwitchDropdownProps = {
  anchor: { top: number; right: number } | null;
  goals: GoalView[];
  onSwitch: (goalId: string, active: boolean) => void;
  onClose: () => void;
};

/** The top-right dropdown: every goal still in progress, with a box that is filled while it is on. */
function SwitchDropdown({ anchor, goals, onSwitch, onClose }: SwitchDropdownProps) {
  return (
    <Modal visible={anchor !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
      {anchor ? (
        <View style={[styles.dropdown, { top: anchor.top, right: anchor.right }]}>
          {goals.map((goal) => {
            const on = goal.status === 'active';
            return (
              <Pressable
                key={goal.id}
                accessibilityRole="switch"
                accessibilityLabel={goal.name}
                accessibilityState={{ checked: on }}
                onPress={() => onSwitch(goal.id, !on)}
                style={styles.dropdownRow}
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]} />
                <BodyText style={[styles.dropdownName, !on && styles.dropdownNameOff]} numberOfLines={1}>
                  {goal.name}
                </BodyText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Modal>
  );
}

type GoalDetails = { name: string; target: number; deadline: DateKey };

type GoalFormProps = {
  visible: boolean;
  today: DateKey;
  onCancel: () => void;
  onCreate: (details: GoalDetails) => void;
};

/** The form for a new goal: a name, a target in hours and a deadline date from today on. */
function GoalForm({ visible, today, onCancel, onCreate }: GoalFormProps) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [deadline, setDeadline] = useState<DateKey | null>(null);

  const trimmedName = name.trim();
  const targetHours = Number(hours.replace(',', '.'));
  const target = Number.isFinite(targetHours) && targetHours > 0 ? Math.round(targetHours * HOUR) : null;
  const complete = trimmedName !== '' && target !== null && deadline !== null;

  const create = () => {
    if (trimmedName === '' || target === null || deadline === null) return;
    onCreate({ name: trimmedName, target, deadline });
  };

  return (
    <Modal visible={visible} animationType="slide" backdropColor={colors.background} onRequestClose={onCancel}>
      <Screen>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.form}>
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <PixelText style={styles.title}>New goal</PixelText>

            <View style={styles.field}>
              <PixelText style={styles.label}>Name</PixelText>
              <PixelInput
                value={name}
                onChangeText={setName}
                placeholder="Finals"
                maxLength={40}
                autoCapitalize="sentences"
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <PixelText style={styles.label}>Target</PixelText>
              <PixelInput
                value={hours}
                onChangeText={setHours}
                placeholder="100"
                suffix="hours"
                keyboardType="decimal-pad"
                maxLength={6}
              />
            </View>

            <View style={styles.field}>
              <PixelText style={styles.label}>Deadline</PixelText>
              <PixelDatePicker value={deadline} min={today} onChange={setDeadline} />
            </View>

            <BodyText style={[styles.hint, complete && styles.summary]}>
              {complete
                ? `${trimmedName}: ${formatWorkTimeShort(target)} by ${formatShortDate(deadline, today)}`
                : 'Only work done while the goal is switched on counts toward it.'}
            </BodyText>

            <View style={styles.formActions}>
              <PixelButton label="Create goal" variant="primary" disabled={!complete} onPress={create} />
              <PixelButton label="Cancel" onPress={onCancel} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    lineHeight: 24,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  switchLabel: {
    fontSize: 9,
    lineHeight: 12,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 8,
  },
  emptyTitle: {
    fontSize: 12,
    lineHeight: 20,
  },
  hint: {
    color: colors.muted,
    textAlign: 'center',
  },
  list: {
    gap: 14,
    paddingBottom: 16,
  },
  card: {
    borderWidth: 2,
    borderColor: colors.text,
    padding: 12,
    gap: 10,
  },
  cardFaded: {
    opacity: 0.45,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  goalName: {
    flex: 1,
    fontSize: 11,
    lineHeight: 18,
  },
  tag: {
    fontSize: 8,
    lineHeight: 12,
    marginTop: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  progress: {
    color: colors.yellow,
  },
  deadline: {
    color: colors.muted,
  },
  actions: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dropdown: {
    position: 'absolute',
    minWidth: 220,
    maxWidth: 320,
    backgroundColor: colors.background,
    borderWidth: 3,
    borderColor: colors.text,
    padding: 6,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: colors.text,
  },
  checkboxOn: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  dropdownName: {
    flexShrink: 1,
  },
  dropdownNameOff: {
    color: colors.muted,
  },
  form: {
    flex: 1,
  },
  formContent: {
    paddingTop: 8,
    paddingBottom: 24,
    gap: 20,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 10,
    lineHeight: 16,
    color: colors.muted,
  },
  summary: {
    color: colors.yellow,
  },
  formActions: {
    gap: 12,
    marginTop: 4,
  },
});
