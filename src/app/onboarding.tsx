import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { defaultPlantKind, plantKinds } from '@/plants';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { icons } from '@/ui/icons';
import { PixelButton } from '@/ui/PixelButton';
import { PixelInput } from '@/ui/PixelInput';
import { PixelSprite } from '@/ui/PixelSprite';
import { BodyText, PixelText } from '@/ui/PixelText';
import { PlantPicture } from '@/ui/PlantPicture';
import { Screen } from '@/ui/Screen';

/**
 * First launch: one "how it works" screen, then "What should we call you?". Choosing a name is
 * what finishes onboarding; from then on the root layout shows the tabs instead of this.
 */
export default function OnboardingScreen() {
  const { act, settings } = useStore();
  const [step, setStep] = useState<'how-it-works' | 'name'>('how-it-works');
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const kind = plantKinds[defaultPlantKind];

  const finish = () => {
    if (trimmed === '') return;
    act({ type: 'set-display-name', displayName: trimmed });
  };

  if (step === 'name') {
    return (
      <Screen>
        <View style={styles.content}>
          <PixelText style={styles.title}>What should we call you?</PixelText>
          <PixelInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            maxLength={24}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={finish}
          />
          <BodyText style={styles.hint}>You can change this any time in Settings.</BodyText>
          <PixelButton label="Let's go" variant="primary" disabled={trimmed === ''} onPress={finish} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PlantPicture kind={kind} look="full-bloom" petalColour={settings.petalColour} scale={5} />
        <PixelText style={styles.title}>How it works</PixelText>

        <View style={styles.rules}>
          <Rule picture={<PlantPicture kind={kind} look="full-bloom" petalColour={settings.petalColour} scale={2} />}>
            Working grows your rose. Ten hours of work takes it to full bloom.
          </Rule>
          <Rule picture={<PlantPicture kind={kind} look="wilting" petalColour={settings.petalColour} scale={2} />}>
            When you stop working, it wilts. Six hours later, it dies.
          </Rule>
          <Rule picture={<PixelSprite rows={icons.calendar} color={colors.yellow} scale={5} />}>
            Work every day, however little, to keep your streak. Miss a whole day and it breaks.
          </Rule>
        </View>

        <View style={styles.next}>
          <PixelButton label="Next" variant="primary" onPress={() => setStep('name')} />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** One rule of the game: a small pixel picture beside a line of text. */
function Rule({ picture, children }: { picture: ReactNode; children: string }) {
  return (
    <View style={styles.rule}>
      <View style={styles.picture}>{picture}</View>
      <BodyText style={styles.ruleText}>{children}</BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 24,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'center',
  },
  rules: {
    gap: 20,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  picture: {
    width: 64,
    alignItems: 'center',
  },
  ruleText: {
    flex: 1,
  },
  next: {
    marginTop: 'auto',
  },
  hint: {
    color: colors.muted,
    textAlign: 'center',
  },
});
