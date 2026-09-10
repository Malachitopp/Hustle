import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts } from '@/theme';
import { BodyText } from '@/ui/PixelText';

type Props = TextInputProps & {
  /** Text shown after the field, inside the border: a unit such as "hours". */
  suffix?: string;
};

/** A bordered text field in the readable font. */
export function PixelInput({ suffix, style, ...props }: Props) {
  return (
    <View style={styles.box}>
      <TextInput
        placeholderTextColor={colors.muted}
        selectionColor={colors.yellow}
        keyboardAppearance="dark"
        {...props}
        style={[styles.input, style]}
      />
      {suffix ? <BodyText style={styles.suffix}>{suffix}</BodyText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.text,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 24,
    color: colors.text,
    paddingVertical: 8,
  },
  suffix: {
    color: colors.muted,
    marginLeft: 8,
  },
});
