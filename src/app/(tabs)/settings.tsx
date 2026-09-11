import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { canSignInWithApple, signInWithApple } from '@/account';
import {
  defaultPlantKind,
  petalColourName,
  petalColourOrder,
  petalColours,
  plantKinds,
  type PetalColour,
} from '@/plants';
import { notificationsAllowed } from '@/notifications';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { PixelButton } from '@/ui/PixelButton';
import { PixelInput } from '@/ui/PixelInput';
import { PixelSwitch } from '@/ui/PixelSwitch';
import { BodyText, PixelText } from '@/ui/PixelText';
import { PlantPicture } from '@/ui/PlantPicture';
import { Screen } from '@/ui/Screen';

export default function SettingsScreen() {
  const { state, act, settings, updateSettings } = useStore();
  const kind = plantKinds[defaultPlantKind];
  const displayName = state.displayName ?? '';
  const switches = state.notificationSwitches;
  const allowed = useNotificationsAllowed();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PixelText style={styles.title}>Settings</PixelText>

        <View style={styles.section}>
          <PixelText style={styles.sectionTitle}>Display name</PixelText>
          <DisplayNameField
            key={displayName}
            name={displayName}
            onChange={(name) => act({ type: 'set-display-name', displayName: name })}
          />
          <BodyText style={styles.hint}>What the app calls you on the Home screen.</BodyText>
        </View>

        <View style={[styles.section, styles.centred]}>
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

        <View style={styles.section}>
          <PixelText style={styles.sectionTitle}>Notifications</PixelText>
          <PixelSwitch
            label="Pause warnings"
            description="A warning 5 hours into a pause, and a notice when a paused session ends by itself."
            value={switches.pauseWarnings}
            onChange={(on) => act({ type: 'set-notification-switches', switches: { pauseWarnings: on } })}
          />
          <PixelSwitch
            label="Streak reminder"
            description="At 9pm on a day you haven't worked yet, while you have a streak to keep."
            value={switches.streakReminder}
            onChange={(on) => act({ type: 'set-notification-switches', switches: { streakReminder: on } })}
          />
          <BodyText style={styles.hint}>Nothing is sent between 10pm and 8am.</BodyText>
          {allowed === false ? (
            <View style={styles.blocked}>
              <BodyText style={styles.hint}>
                Your phone has notifications switched off for Hustle, so none of these will show.
              </BodyText>
              <PixelButton label="Open phone settings" onPress={() => Linking.openSettings()} />
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <PixelText style={styles.sectionTitle}>Back up your progress</PixelText>
          <BackupSection />
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * Back up your progress. A guest is offered Sign in with Apple, on Apple's own button as its
 * guidelines ask. Once signed in, the section says so and, while the account's record is still
 * to be restored or any sessions are still to upload, says that too.
 */
function BackupSection() {
  const { state, act } = useStore();
  const available = useAppleSignInAvailable();
  const [signingIn, setSigningIn] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const waiting = state.pendingUploads.length;

  if (state.account) {
    return (
      <>
        <BodyText>Signed in with Apple. Every session is backed up when it ends.</BodyText>
        <BodyText style={styles.hint}>
          {!state.account.restored
            ? "Fetching your account's record. It arrives as soon as you're online."
            : waiting === 0
              ? 'Everything on this phone is backed up.'
              : `${countOf(waiting, 'session')} waiting to upload. ${waiting === 1 ? 'It goes' : 'They go'} as soon as you're online.`}
        </BodyText>
      </>
    );
  }

  const signIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setFailure(null);
    const outcome = await signInWithApple();
    setSigningIn(false);
    if (outcome.status === 'signed-in') act({ type: 'sign-in', ...outcome.account });
    else if (outcome.status === 'failed') setFailure(outcome.reason);
  };

  return (
    <>
      <BodyText>
        Sign in with Apple to keep your record safe if you lose or change your phone.
        {waiting > 0 ? ` The ${countOf(waiting, 'session')} on this phone will be backed up too.` : ''}
      </BodyText>
      {available === true ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={0}
          style={styles.appleButton}
          onPress={signIn}
        />
      ) : null}
      {available === false ? (
        <BodyText style={styles.hint}>{"Sign in with Apple isn't available in this build."}</BodyText>
      ) : null}
      {signingIn ? <BodyText style={styles.hint}>Signing in…</BodyText> : null}
      {failure ? <BodyText style={styles.failure}>{`Couldn't sign in: ${failure}`}</BodyText> : null}
    </>
  );
}

/** "1 session" or "3 sessions". */
function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Whether Sign in with Apple can be offered here: null while that is being checked. */
function useAppleSignInAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let gone = false;
    canSignInWithApple().then((value) => {
      if (!gone) setAvailable(value);
    });
    return () => {
      gone = true;
    };
  }, []);

  return available;
}

/**
 * Whether the phone lets Hustle show notifications: false once the user has said no, otherwise
 * null. Checked on arrival and again whenever the app comes back to the foreground, which is
 * how a trip to the phone's Settings shows up.
 */
function useNotificationsAllowed(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let gone = false;
    const check = () => {
      notificationsAllowed().then((value) => {
        if (!gone) setAllowed(value);
      });
    };
    check();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') check();
    });
    return () => {
      gone = true;
      subscription.remove();
    };
  }, []);

  return allowed;
}

type DisplayNameFieldProps = {
  name: string;
  onChange: (name: string) => void;
};

/**
 * The name field. It saves when editing finishes, so the history is not rewritten on every
 * keystroke, and an emptied field goes back to the saved name: the name can never be blank.
 */
function DisplayNameField({ name, onChange }: DisplayNameFieldProps) {
  const [draft, setDraft] = useState(name);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === '') setDraft(name);
    else if (trimmed !== name) onChange(trimmed);
    else setDraft(trimmed);
  };

  return (
    <PixelInput
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder="Your name"
      maxLength={24}
      autoCapitalize="words"
      autoCorrect={false}
      returnKeyType="done"
    />
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
    gap: 16,
  },
  centred: {
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 10,
    lineHeight: 16,
    color: colors.muted,
    alignSelf: 'flex-start',
  },
  hint: {
    color: colors.muted,
  },
  blocked: {
    gap: 12,
    paddingTop: 4,
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
  appleButton: {
    height: 56,
  },
  failure: {
    color: colors.red,
  },
});
