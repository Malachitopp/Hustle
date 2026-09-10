import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  defaultPlantKind,
  petalColourName,
  petalColourOrder,
  petalColours,
  plantKinds,
  type PetalColour,
} from '@/plants';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { BodyText, PixelText } from '@/ui/PixelText';
import { PlantPicture } from '@/ui/PlantPicture';
import { Screen } from '@/ui/Screen';

export default function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const kind = plantKinds[defaultPlantKind];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PixelText style={styles.title}>Settings</PixelText>

        <View style={styles.section}>
          <PixelText style={styles.sectionTitle}>Petal colour</PixelText>
          <PlantPicture kind={kind} look="full-bloom" petalColour={settings.petalColour} scale={4} />
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {petalColourOrder.map((colour) => (
              <Swatch
                key={colour}
                colour={colour}
                selected={colour === settings.petalColour}
                onPress={() => updateSettings({ petalColour: colour })}
              />
            ))}
          </View>
          <BodyText style={styles.colourName}>{petalColourName(settings.petalColour)}</BodyText>
        </View>
      </ScrollView>
    </Screen>
  );
}

type SwatchProps = {
  colour: PetalColour;
  selected: boolean;
  onPress: () => void;
};

/** One petal colour to pick. The chosen one has a white frame. */
function Swatch({ colour, selected, onPress }: SwatchProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={petalColourName(colour)}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      hitSlop={4}
      style={[styles.swatch, selected && styles.swatchSelected]}
    >
      <View style={[styles.swatchFill, { backgroundColor: petalColours[colour].base }]}>
        <View style={[styles.swatchLight, { backgroundColor: petalColours[colour].light }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    paddingBottom: 24,
    gap: 28,
  },
  title: {
    fontSize: 16,
    lineHeight: 24,
  },
  section: {
    alignItems: 'center',
    gap: 16,
  },
  sectionTitle: {
    fontSize: 10,
    lineHeight: 16,
    color: colors.muted,
    alignSelf: 'flex-start',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  swatch: {
    padding: 3,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: colors.text,
  },
  swatchFill: {
    width: 30,
    height: 30,
    padding: 4,
  },
  swatchLight: {
    width: 8,
    height: 8,
  },
  colourName: {
    color: colors.yellow,
  },
});
