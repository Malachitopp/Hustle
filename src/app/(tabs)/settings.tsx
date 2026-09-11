import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { deleteAccount, providerName, signOut } from '@/account';
import type { Provider } from '@/core';
import {
  defaultPlantKind,
  petalColourName,
  petalColourOrDefault,
  petalColourOrder,
  petalColours,
  plantKinds,
  type PetalColour,
} from '@/plants';
import { notificationsAllowed } from '@/notifications';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { PixelButton } from '@/ui/PixelButton';
import { PixelDialog, type DialogAction } from '@/ui/PixelDialog';
import { PixelInput } from '@/ui/PixelInput';
import { PixelSwitch } from '@/ui/PixelSwitch';
import { BodyText, PixelText } from '@/ui/PixelText';
import { PlantPicture } from '@/ui/PlantPicture';
import { Screen } from '@/ui/Screen';
import { SignInButtons } from '@/ui/SignInButtons';

export default function SettingsScreen() {
  const { state, act } = useStore();
  const kind = plantKinds[defaultPlantKind];
  const displayName = state.displayName ?? '';
  const petalColour = petalColourOrDefault(state.petalColour);
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
          <PlantPicture kind={kind} look="full-bloom" petalColour={petalColour} scale={4} />
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {petalColourOrder.map((colour) => (
              <Swatch
                key={colour}
                colour={colour}
                selected={colour === petalColour}
                onPress={() => act({ type: 'set-petal-colour', petalColour: colour })}
              />
            ))}
          </View>
          <BodyText style={styles.colourName}>{petalColourName(petalColour)}</BodyText>
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

        <AccountSection />
      </ScrollView>
    </Screen>
  );
}

/** What the user asked the account section for, for which account, and how far it has got. */
type Request = 'sign-out' | 'delete-account';
type PopUp = { request: Request; provider: Provider } & (
  | { stage: 'asking' }
  | { stage: 'working' }
  | { stage: 'failed'; reason: string }
);

/**
 * The account section. A guest is offered Sign in with Apple and Sign in with Google, the same
 * pair as Save your progress. Once signed in, the section says so and, while the account's copy
 * is still to be restored or any changes are still to upload, says that too, and offers Sign out
 * and Delete account. Both ask first, in a pop-up that warns of anything on the phone that would
 * be lost, and both end with the phone as on first launch, which sends the app back to
 * onboarding. The phone is cleared only once the pop-up has gone, because iOS cannot take a
 * screen and its pop-up down together, and the section stays on the screen until then whatever
 * the server has meanwhile said about the sign-in.
 */
function AccountSection() {
  const { state, act } = useStore();
  const account = state.account;
  const sessions = state.pendingUploads.length;
  const waiting =
    sessions +
    state.pendingGoalUploads.length +
    state.pendingGoalDeletions.length +
    (state.pendingSettingsUpload ? 1 : 0);

  /** The pop-up, and whether it is open. The last one stays as it was while it fades out. */
  const [popUp, setPopUp] = useState<PopUp | null>(null);
  const [popUpOpen, setPopUpOpen] = useState(false);
  /** What went through, once something has: the phone is cleared when the pop-up has gone. */
  const [done, setDone] = useState<Request | null>(null);

  useEffect(() => {
    if (done === null) return;
    // The pop-up says when it has gone; the timer covers a platform that never says so.
    const timer = setTimeout(() => act({ type: 'sign-out' }), 700);
    return () => clearTimeout(timer);
  }, [done, act]);

  // The account is noted when the pop-up opens: the server may end the sign-in before the
  // request is through, and the request is still about that account.
  const ask = (request: Request) => {
    if (!account) return;
    setPopUp({ request, provider: account.provider, stage: 'asking' });
    setPopUpOpen(true);
  };

  const cancel = () => {
    setPopUpOpen(false);
  };

  const go = async () => {
    if (!popUp) return;
    const { request, provider } = popUp;
    setPopUp({ request, provider, stage: 'working' });
    const outcome = request === 'sign-out' ? await signOut(provider) : await deleteAccount(provider);
    if (outcome.status === 'failed') {
      setPopUp({ request, provider, stage: 'failed', reason: outcome.reason });
      return;
    }
    setDone(request);
    setPopUpOpen(false);
  };

  const popUpClosed = () => {
    if (done !== null) act({ type: 'sign-out' });
  };

  const request = popUp?.request ?? 'sign-out';
  const signingOut = request === 'sign-out';
  const actions: DialogAction[] =
    !popUp || popUp.stage === 'working'
      ? []
      : popUp.stage === 'asking'
        ? [
            { label: signingOut ? 'Sign out' : 'Delete my account', variant: 'danger', onPress: go },
            { label: signingOut ? 'Stay signed in' : 'Keep my account', onPress: cancel },
          ]
        : [
            { label: 'Try again', variant: 'danger', onPress: go },
            { label: 'Not now', onPress: cancel },
          ];

  return (
    <View style={styles.section}>
      <PixelText style={styles.sectionTitle}>{account ? 'Account' : 'Back up your progress'}</PixelText>
      {done !== null ? (
        <BodyText style={styles.hint}>{done === 'sign-out' ? 'Signed out.' : 'Your account is deleted.'}</BodyText>
      ) : account ? (
        <>
          <BodyText>
            {`Signed in with ${providerName(account.provider)}. Your sessions, goals and settings are backed up as they change.`}
          </BodyText>
          <BodyText style={styles.hint}>
            {!account.restored
              ? "Fetching your account's record, goals and settings. They arrive as soon as you're online."
              : waiting === 0
                ? 'Everything on this phone is backed up.'
                : `${countOf(waiting, 'change')} waiting to upload. ${waiting === 1 ? 'It goes' : 'They go'} as soon as you're online.`}
          </BodyText>
          <PixelButton label="Sign out" onPress={() => ask('sign-out')} />
          <PixelButton label="Delete account" variant="danger" onPress={() => ask('delete-account')} />
        </>
      ) : (
        <>
          <BodyText>
            Sign in to keep your record, goals and settings safe if you lose or change your phone.
            {sessions > 0 ? ` The ${countOf(sessions, 'session')} on this phone will be backed up too.` : ''}
          </BodyText>
          <SignInButtons />
        </>
      )}

      <PixelDialog
        visible={popUpOpen}
        title={signingOut ? 'Sign out?' : 'Delete your account?'}
        message={popUp ? popUpText(popUp, { sessionInProgress: state.current !== null, waiting }) : undefined}
        actions={actions}
        onDismiss={popUp?.stage === 'working' ? undefined : cancel}
        onClosed={popUpClosed}
      />
    </View>
  );
}

type PhoneSituation = {
  sessionInProgress: boolean;
  /** How many changes are still to upload. */
  waiting: number;
};

/** What the pop-up says at each stage. The warnings name what would go with the phone's copy. */
function popUpText(popUp: PopUp, phone: PhoneSituation): string {
  const signingOut = popUp.request === 'sign-out';
  switch (popUp.stage) {
    case 'asking': {
      const lines = signingOut
        ? [
            'This phone goes back to a fresh start, as when you first opened Hustle. Your record, goals and settings stay backed up in your account, ready for when you sign in again.',
          ]
        : [
            "This removes your login and everything Hustle holds for you, on this phone and in your account: your record, goals and settings. It can't be undone.",
          ];
      if (!signingOut && popUp.provider === 'apple') lines.push("Hustle's access to your Apple ID is withdrawn too.");
      if (phone.sessionInProgress) lines.push('A session is in progress and would be lost. End it first to keep it.');
      if (signingOut && phone.waiting > 0) {
        lines.push(
          `${countOf(phone.waiting, 'change')} on this phone ${phone.waiting === 1 ? "hasn't" : "haven't"} been backed up yet and would be lost.`,
        );
      }
      return lines.join(' ');
    }
    case 'working':
      return signingOut ? 'Signing out…' : 'Deleting your account…';
    case 'failed':
      return `${signingOut ? "Couldn't sign out" : "Couldn't delete your account"}: ${popUp.reason}`;
  }
}

/** "1 session" or "3 sessions". */
function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
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
});
