import { StyleSheet } from 'react-native';

import { colors } from '@/theme';
import { BodyText, PixelText } from '@/ui/PixelText';
import { Screen } from '@/ui/Screen';

/** A tab that exists but does nothing yet. */
export function Placeholder({ title }: { title: string }) {
  return (
    <Screen style={styles.screen}>
      <PixelText style={styles.title}>{title}</PixelText>
      <BodyText style={styles.note}>Coming soon.</BodyText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 16,
    lineHeight: 24,
  },
  note: {
    color: colors.muted,
  },
});
