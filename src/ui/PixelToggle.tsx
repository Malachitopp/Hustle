import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { PixelText } from '@/ui/PixelText';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of choices of which exactly one is selected. The selected one is filled. */
export function PixelToggle<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[styles.option, index > 0 && styles.optionAfterFirst, selected && styles.selected]}
          >
            <PixelText style={[styles.label, selected && styles.labelSelected]}>{option.label}</PixelText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: colors.text,
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.background,
  },
  optionAfterFirst: {
    borderLeftWidth: 2,
    borderLeftColor: colors.text,
  },
  selected: {
    backgroundColor: colors.text,
  },
  label: {
    fontSize: 9,
    lineHeight: 12,
  },
  labelSelected: {
    color: colors.background,
  },
});
