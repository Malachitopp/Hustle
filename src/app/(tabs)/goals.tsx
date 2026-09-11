import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  formatShortDate,
  formatWorkTimeShort,
  view,
  type DateKey,
  type GoalStatus,
  type GoalView,
} from '@/core';
import { useGoalsRestore } from '@/hooks/useGoalsRestore';
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
import { PixelToggle } from '@/ui/PixelToggle';
import { Screen } from '@/ui/Screen';

const HOUR = 60 * 60_000;

const DOWN_ARROW = ['#######', '.#####.', '..###..', '...#...'];

/** The two pages a swipe moves between: goals in progress, and the finished ones. */
type Page = 'goals' | 'history';

const PAGES = [
  { value: 'goals', label: 'Goals' },
  { value: 'history', label: 'History' },
] as const satisfies readonly { value: Page; label: string }[];

const PAGE_INDEX: Record<Page, number> = { goals: 0, history: 1 };

/** Padding either side of the pages, the same as every screen's. */
const GUTTER = 20;

export default function GoalsScreen() {
  const { state, act } = useStore();
  const [now, wakeAt] = useNow();
  const timeZone = phoneTimeZone();
  const { goals, calendar } = view(state, now, timeZone);
  const focused = useIsFocused();
  // Opening Goals fetches the account's goals, once per launch, so ones made on another phone turn up.
  useGoalsRestore();

  const [page, setPage] = useState<Page>('goals');
  const pager = useRef<ScrollView>(null);
  /** Counts the times the form has been opened, so each opening starts from fresh fields. */
  const [formOpening, setFormOpening] = useState(0);
  /** The form: for a new goal, or for the goal being edited. Null while it is closed. */
  const [form, setForm] = useState<{ goal: GoalView | null } | null>(null);
  /** Where the switch dropdown hangs from, or null while it is closed. */
  const [dropdown, setDropdown] = useState<{ top: number; right: number } | null>(null);
  const switchButton = useRef<View>(null);
  const { width } = useWindowDimensions();

  /**
   * True from the moment the form or the dropdown closes until iOS has taken it off the screen.
   * A pop-up presented in that moment collides with the one on its way out and never appears,
   * so the celebration waits.
   */
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!closing) return;
    // The modal says when it has gone; the timer covers a platform that never says so.
    const timer = setTimeout(() => setClosing(false), 700);
    return () => clearTimeout(timer);
  }, [closing]);

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
  // The most recently finished goal first: at the moment it was achieved, or the end of its deadline.
  const finished = goals
    .filter((goal) => goal.status === 'achieved' || goal.status === 'missed')
    .sort((a, b) => (b.achievedAt ?? b.endsAt) - (a.achievedAt ?? a.endsAt));

  // One celebration at a time, only while this tab is showing with nothing open over it.
  const toCelebrate =
    focused && form === null && dropdown === null && !closing
      ? (goals.find((goal) => goal.status === 'achieved' && goal.celebratedAt === null) ?? null)
      : null;

  const showPage = (next: Page) => {
    setPage(next);
    pager.current?.scrollTo({ x: PAGE_INDEX[next] * width, animated: true });
  };

  const settlePage = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setPage(index >= 1 ? 'history' : 'goals');
  };

  const openForm = (goal: GoalView | null) => {
    setFormOpening((count) => count + 1);
    setForm({ goal });
  };

  const openDropdown = () => {
    switchButton.current?.measureInWindow((x, y, w, h) => {
      setDropdown({ top: y + h + 6, right: Math.max(0, width - x - w) });
    });
  };

  const closeForm = () => {
    setForm(null);
    setClosing(true);
  };

  const closeDropdown = () => {
    setDropdown(null);
    setClosing(true);
  };

  const saveGoal = (details: GoalDetails) => {
    const editing = form?.goal ?? null;
    closeForm();
    if (editing) act({ type: 'edit-goal', goalId: editing.id, ...details });
    else act({ type: 'create-goal', goalId: newId(), timeZone, ...details });
  };

  const deleteGoal = () => {
    const editing = form?.goal ?? null;
    closeForm();
    if (editing) act({ type: 'delete-goal', goalId: editing.id });
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <PixelToggle options={PAGES} value={page} onChange={showPage} />
        {page === 'goals' && inProgress.length > 0 ? (
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

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settlePage}
        style={styles.pager}
      >
        <View style={[styles.page, { width }]}>
          {inProgress.length === 0 ? (
            goals.length === 0 ? (
              <Empty title="No goals yet">
                A goal is an amount of work to reach by a date, like 100h by 24 Oct. Only work done while the goal
                is switched on counts.
              </Empty>
            ) : (
              <Empty title="Nothing in progress">Swipe left to see the goals you have finished.</Empty>
            )
          ) : (
            <GoalList goals={inProgress} today={calendar.today} onPress={openForm} />
          )}
        </View>
        <View style={[styles.page, { width }]}>
          {finished.length === 0 ? (
            <Empty title="No finished goals">Achieved and missed goals end up here.</Empty>
          ) : (
            <GoalList goals={finished} today={calendar.today} onPress={openForm} />
          )}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <PixelButton label="New goal" variant="primary" onPress={() => openForm(null)} />
      </View>

      <SwitchDropdown
        anchor={dropdown}
        goals={inProgress}
        onSwitch={(goalId, active) => act({ type: 'switch-goal', goalId, active })}
        onClose={closeDropdown}
        onClosed={() => setClosing(false)}
      />

      <GoalForm
        key={formOpening}
        visible={form !== null}
        goal={form?.goal ?? null}
        today={calendar.today}
        onCancel={closeForm}
        onSave={saveGoal}
        onDelete={deleteGoal}
        onClosed={() => setClosing(false)}
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

/** A page with nothing to list: a title and a line of help. */
function Empty({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.empty}>
      <PixelText style={styles.emptyTitle}>{title}</PixelText>
      <BodyText style={styles.hint}>{children}</BodyText>
    </View>
  );
}

type GoalListProps = {
  goals: GoalView[];
  today: DateKey;
  onPress: (goal: GoalView) => void;
};

/** One page's goals, each a card that opens the goal for editing. */
function GoalList({ goals, today, onPress }: GoalListProps) {
  return (
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} today={today} onPress={() => onPress(goal)} />
      ))}
      <BodyText style={styles.hint}>Tap a goal to edit or delete it.</BodyText>
    </ScrollView>
  );
}

const STATUS_TAGS: Record<GoalStatus, { label: string; color: string } | null> = {
  active: null,
  dormant: { label: 'Dormant', color: colors.muted },
  achieved: { label: 'Achieved', color: colors.yellow },
  missed: { label: 'Missed', color: colors.red },
};

type GoalCardProps = {
  goal: GoalView;
  today: DateKey;
  onPress: () => void;
};

/** One goal: its name, progress bar, work time against the target, and deadline. */
function GoalCard({ goal, today, onPress }: GoalCardProps) {
  const tag = STATUS_TAGS[goal.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={goal.name}
      accessibilityHint="Opens the goal to edit or delete it"
      onPress={onPress}
      style={({ pressed }) => [styles.card, goal.status === 'dormant' && styles.cardFaded, pressed && styles.cardPressed]}
    >
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
    </Pressable>
  );
}

type SwitchDropdownProps = {
  anchor: { top: number; right: number } | null;
  goals: GoalView[];
  onSwitch: (goalId: string, active: boolean) => void;
  onClose: () => void;
  /** Called once the dropdown has gone from the screen, after its closing animation. */
  onClosed: () => void;
};

/** The top-right dropdown: every goal still in progress, with a box that is filled while it is on. */
function SwitchDropdown({ anchor, goals, onSwitch, onClose, onClosed }: SwitchDropdownProps) {
  return (
    <Modal
      visible={anchor !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onClosed}
    >
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
  /** The goal being edited, or null for a new one. */
  goal: GoalView | null;
  today: DateKey;
  onCancel: () => void;
  onSave: (details: GoalDetails) => void;
  onDelete: () => void;
  /** Called once the form has gone from the screen, after its closing animation. */
  onClosed: () => void;
};

/**
 * The form for a goal: a name, a target in hours and a deadline date from today on. For a new
 * goal it starts blank; for an existing one it starts from the goal's details, saves only once
 * something has changed, and can delete the goal after a confirmation.
 */
function GoalForm({ visible, goal, today, onCancel, onSave, onDelete, onClosed }: GoalFormProps) {
  const [name, setName] = useState(goal ? goal.name : '');
  const [hours, setHours] = useState(goal ? formatHours(goal.target) : '');
  const [deadline, setDeadline] = useState<DateKey | null>(goal ? goal.deadline : null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const askToDelete = () => {
    Keyboard.dismiss();
    setConfirmingDelete(true);
  };

  const trimmedName = name.trim();
  const targetHours = Number(hours.replace(',', '.'));
  const target = Number.isFinite(targetHours) && targetHours > 0 ? Math.round(targetHours * HOUR) : null;
  const complete = trimmedName !== '' && target !== null && deadline !== null;
  const changed =
    goal === null || trimmedName !== goal.name || target !== goal.target || deadline !== goal.deadline;

  const save = () => {
    if (trimmedName === '' || target === null || deadline === null) return;
    onSave({ name: trimmedName, target, deadline });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      backdropColor={colors.background}
      onRequestClose={confirmingDelete ? () => setConfirmingDelete(false) : onCancel}
      onDismiss={onClosed}
    >
      <Screen>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.form}>
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <PixelText style={styles.title}>{goal ? 'Edit goal' : 'New goal'}</PixelText>

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
              <PixelButton
                label={goal ? 'Save changes' : 'Create goal'}
                variant="primary"
                disabled={!complete || !changed}
                onPress={save}
              />
              {goal ? (
                <PixelButton label="Delete goal" variant="danger" onPress={askToDelete} />
              ) : null}
              <PixelButton label="Cancel" onPress={onCancel} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>

      {/* Drawn inside this modal, never as a modal of its own: see PixelDialog's inline. */}
      {goal ? (
        <PixelDialog
          inline
          visible={confirmingDelete}
          title="Delete goal?"
          message={`${describe(goal, today)} will be removed. The work you did stays in the record.`}
          actions={[
            { label: 'Keep it', onPress: () => setConfirmingDelete(false) },
            { label: 'Delete goal', variant: 'danger', onPress: onDelete },
          ]}
        />
      ) : null}
    </Modal>
  );
}

/**
 * A target as it goes in the hours field: "100", or "2.5" for two and a half hours. Four decimals
 * cover anything the six-character field can hold, so a target comes back exactly as typed.
 */
function formatHours(target: number): string {
  return String(Number((target / HOUR).toFixed(4)));
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingHorizontal: GUTTER,
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
  pager: {
    flex: 1,
  },
  page: {
    paddingHorizontal: GUTTER,
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
  cardPressed: {
    backgroundColor: '#1A1A1A',
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
    paddingHorizontal: GUTTER,
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
