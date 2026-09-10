import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { BodyText, PixelText } from '@/ui/PixelText';

type Props = {
  label: string;
  /** A line under the label saying what the switch does. */
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

/** An on/off switch: a label on the left, a chunky track with a square knob on the right. */
export function PixelSwitch({ label, description, value, onChange }: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.row}
    >
      <View style={styles.text}>
        <PixelText style={styles.label}>{label}</PixelText>
        {description ? <BodyText style={styles.description}>{description}</BodyText> : null}
      </View>
      <View style={[styles.track, value ? styles.trackOn : styles.trackOff]}>
        <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 10,
    lineHeight: 16,
  },
  description: {
    fontSize: 19,
    lineHeight: 22,
    color: colors.muted,
  },
  track: {
    width: 52,
    height: 28,
    padding: 4,
    borderWidth: 2,
    borderColor: colors.text,
    flexDirection: 'row',
  },
  trackOn: {
    backgroundColor: colors.yellow,
    justifyContent: 'flex-end',
  },
  trackOff: {
    backgroundColor: colors.background,
    justifyContent: 'flex-start',
  },
  knob: {
    width: 16,
    height: 16,
  },
  knobOn: {
    backgroundColor: colors.background,
  },
  knobOff: {
    backgroundColor: colors.muted,
  },
});
