import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatClockTime, formatWorkTime, view } from '@/core';
import { useNow } from '@/hooks/useNow';
import { newId, phoneTimeZone } from '@/phone';
import { defaultPlantKind, plantKinds } from '@/plants';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { PixelButton } from '@/ui/PixelButton';
import { PixelDialog } from '@/ui/PixelDialog';
import { BodyText, PixelText } from '@/ui/PixelText';
import { PlantPicture } from '@/ui/PlantPicture';
import { Screen } from '@/ui/Screen';

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

  const startSession = () => {
    act({ type: 'start', sessionId: newId(), timeZone });
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
    act({ type: 'end' });
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
