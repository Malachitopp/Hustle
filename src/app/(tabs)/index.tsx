import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatClockTime, formatWorkTime, sessionWorkTime, view } from '@/core';
import { useNow } from '@/hooks/useNow';
import { askNotificationPermission } from '@/notifications';
import { newId, phoneTimeZone } from '@/phone';
import { defaultPlantKind, plantKinds } from '@/plants';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { PixelButton } from '@/ui/PixelButton';
import { PixelConfetti } from '@/ui/PixelConfetti';
import { PixelDialog } from '@/ui/PixelDialog';
import { BodyText, PixelText } from '@/ui/PixelText';
import { PlantPicture } from '@/ui/PlantPicture';
import { Screen } from '@/ui/Screen';
import { SignInButtons } from '@/ui/SignInButtons';

/**
 * The pop-up after a session ends. Session complete first; then, for a guest whose Save your
 * progress is due, that. Both are drawn by the one dialog, so moving from one to the other
 * only changes what its box says: iOS cannot be trusted to close one modal and open another
 * in the same breath.
 */
type PopUp =
  | {
      kind: 'completed';
      /** The session's work time. Milliseconds. */
      workTime: number;
      /** When the rose dies unless work starts again, or null if it has already died. */
      roseDiesAt: number | null;
    }
  | { kind: 'save-progress' };

export default function HomeScreen() {
  const { state, act, settings } = useStore();
  const [now, wakeAt] = useNow();
  const timeZone = phoneTimeZone();
  const home = view(state, now, timeZone);
  const { session, plant } = home;

  // Refresh at the exact moment a paused session ends by itself or the plant dies, not just
  // at the next minute. On a pause those are the same moment.
  const wakeInstant =
    session.state === 'paused' ? session.autoEndsAt : plant.state === 'alive' ? plant.diesAt : null;
  useEffect(() => {
    wakeAt(wakeInstant);
  }, [wakeInstant, wakeAt]);

  /** When End was pressed, or null while no confirmation is showing. */
  const [endPressedAt, setEndPressedAt] = useState<number | null>(null);
  const sessionAtEndPress = endPressedAt === null ? null : view(state, endPressedAt, timeZone).session;

  /** The pop-up, and whether it is open. The last one stays as it was while it fades out. */
  const [popUp, setPopUp] = useState<PopUp | null>(null);
  const [popUpOpen, setPopUpOpen] = useState(false);
  const completed = popUp?.kind === 'completed' ? popUp : null;
  const saving = popUp?.kind === 'save-progress';

  const startSession = () => {
    act({ type: 'start', sessionId: newId(), timeZone });
    // The first Start is the one that asks. The session is running either way.
    askNotificationPermission();
  };

  const pauseSession = () => {
    act({ type: 'pause' });
  };

  const resumeSession = () => {
    act({ type: 'resume' });
  };

  const keepGoing = () => {
    setEndPressedAt(null);
  };

  const endSession = () => {
    setEndPressedAt(null);
    const next = act({ type: 'end' });
    // The session that just ended is the newest in the record. If it had already ended by
    // itself while the confirmation was open, that is still the one, and the rose is dead.
    const ended = next.record[next.record.length - 1];
    if (!ended) return;
    // Seen from the moment it ended: the rose is alive then, or already dead after an auto-end.
    const after = view(next, ended.endedAt, timeZone).plant;
    setPopUp({
      kind: 'completed',
      workTime: sessionWorkTime(ended),
      roseDiesAt: after.state === 'alive' ? after.diesAt : null,
    });
    setPopUpOpen(true);
  };

  const closePopUp = () => {
    setPopUpOpen(false);
  };

  /**
   * After the confetti, a guest is offered Save your progress if it is still due. The offer is
   * noted the moment it shows, so it is made once whatever they choose.
   */
  const closeCompleted = () => {
    if (!home.offerSaveProgress) {
      setPopUpOpen(false);
      return;
    }
    act({ type: 'offer-save-progress' });
    setPopUp({ kind: 'save-progress' });
  };

  return (
    <Screen style={styles.screen}>
      <PixelText style={styles.header}>{home.header.text}</PixelText>
      {home.streak > 0 ? <PixelText style={styles.streak}>Day {home.streak}</PixelText> : null}

      <PlantPicture
        kind={plantKinds[defaultPlantKind]}
        look={plant.state === 'none' ? 'dirt' : plant.look}
        petalColour={settings.petalColour}
        style={styles.plant}
      />

      <View style={styles.actions}>
        {session.state === 'paused' ? (
          <BodyText style={styles.pausedLine}>
            Paused · ends automatically at {formatClockTime(session.autoEndsAt, timeZone)}
          </BodyText>
        ) : null}
        {session.state === 'idle' ? (
          <PixelButton label="Start session" variant="primary" onPress={startSession} />
        ) : null}
        {session.state === 'running' ? <PixelButton label="Pause" onPress={pauseSession} /> : null}
        {session.state === 'paused' ? (
          <PixelButton label="Resume" variant="primary" onPress={resumeSession} />
        ) : null}
        {session.state !== 'idle' ? (
          <PixelButton label="End session" variant="danger" onPress={() => setEndPressedAt(Date.now())} />
        ) : null}
      </View>

      <PixelDialog
        visible={endPressedAt !== null}
        title="End session?"
        message={
          sessionAtEndPress && sessionAtEndPress.state !== 'idle'
            ? `You've worked ${formatWorkTime(sessionAtEndPress.workTime)}.`
            : undefined
        }
        actions={[
          { label: 'Keep going', onPress: keepGoing },
          { label: 'End session', variant: 'danger', onPress: endSession },
        ]}
        onDismiss={keepGoing}
      />

      <PixelDialog
        visible={popUpOpen}
        title={saving ? 'Save your progress' : 'Session complete'}
        highlight={completed ? formatWorkTime(completed.workTime) : undefined}
        message={
          saving
            ? 'Sign in to keep your record safe if you lose or change your phone. You can always do this later in Settings.'
            : completed
              ? completed.roseDiesAt === null
                ? 'Your rose has died.'
                : `Your rose will last until ${formatClockTime(completed.roseDiesAt, timeZone)}`
              : undefined
        }
        actions={
          saving
            ? [{ label: 'Not now', onPress: closePopUp }]
            : [{ label: 'Nice!', variant: 'primary', onPress: closeCompleted }]
        }
        onDismiss={saving ? closePopUp : closeCompleted}
        decoration={saving ? undefined : <PixelConfetti height={240} />}
      >
        {saving ? <SignInButtons onSignedIn={closePopUp} /> : null}
      </PixelDialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 24,
  },
  header: {
    color: colors.yellow,
    fontSize: 15,
    lineHeight: 27,
    textAlign: 'center',
  },
  streak: {
    textAlign: 'center',
    marginTop: 8,
  },
  plant: {
    flex: 1,
    marginVertical: 16,
  },
  actions: {
    gap: 12,
    paddingBottom: 8,
  },
  pausedLine: {
    textAlign: 'center',
    marginBottom: 4,
  },
});
