import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatWorkTime, view } from '@/core';
import { useNow } from '@/hooks/useNow';
import { newSessionId, phoneTimeZone } from '@/phone';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { PixelButton } from '@/ui/PixelButton';
import { PixelDialog } from '@/ui/PixelDialog';
import { PixelText } from '@/ui/PixelText';
import { Screen } from '@/ui/Screen';

export default function HomeScreen() {
  const { state, act } = useStore();
  const now = useNow();
  const timeZone = phoneTimeZone();
  const home = view(state, now, timeZone);

  /** When End was pressed, or null while no confirmation is showing. */
  const [endPressedAt, setEndPressedAt] = useState<number | null>(null);
  const sessionAtEndPress = endPressedAt === null ? null : view(state, endPressedAt, timeZone).session;

  const startSession = () => {
    act({ type: 'start', sessionId: newSessionId(), timeZone });
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

      {/* The plant grows here in a later ticket. */}
      <View style={styles.plant} />

      <View style={styles.actions}>
        {home.session.state === 'idle' ? (
          <PixelButton label="Start session" variant="primary" onPress={startSession} />
        ) : (
          <PixelButton label="End session" variant="danger" onPress={() => setEndPressedAt(Date.now())} />
        )}
      </View>

      <PixelDialog
        visible={endPressedAt !== null}
        title="End session?"
        message={
          sessionAtEndPress?.state === 'running'
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
  plant: {
    flex: 1,
  },
  actions: {
    gap: 12,
    paddingBottom: 8,
  },
});
