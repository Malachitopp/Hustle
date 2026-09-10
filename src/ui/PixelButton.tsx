import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';
import { PixelText } from '@/ui/PixelText';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
};

/** A chunky bordered button. Filled variants invert while pressed; outlined ones fill. */
export function PixelButton({ label, onPress, variant = 'secondary' }: Props) {
  const { color, filled } = looks[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.box,
        { borderColor: color, backgroundColor: filled !== pressed ? color : colors.background },
      ]}
    >
      {({ pressed }) => (
        <PixelText style={[styles.label, { color: filled !== pressed ? colors.background : color }]}>
          {label}
        </PixelText>
      )}
    </Pressable>
  );
}

const looks: Record<ButtonVariant, { color: string; filled: boolean }> = {
  primary: { color: colors.yellow, filled: true },
  secondary: { color: colors.text, filled: false },
  danger: { color: colors.red, filled: false },
};

const styles = StyleSheet.create({
  box: {
    borderWidth: 4,
    minHeight: 64,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});
