import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/theme';

/** Headings, buttons and the Home header, in the pixel font. It needs a generous line height. */
export function PixelText({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.pixel, style]} />;
}

/** Small text, in the readable font. */
export function BodyText({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.body, style]} />;
}

const styles = StyleSheet.create({
  pixel: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    lineHeight: 20,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 22,
    lineHeight: 26,
    color: colors.text,
  },
});
