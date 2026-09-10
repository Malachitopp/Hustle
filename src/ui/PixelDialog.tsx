import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { PixelButton, type ButtonVariant } from '@/ui/PixelButton';
import { BodyText, PixelText } from '@/ui/PixelText';

type DialogAction = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
};

type Props = {
  visible: boolean;
  title: string;
  /** One line drawn large and yellow under the title: a work time, say. */
  highlight?: string;
  message?: string;
  actions: DialogAction[];
  /** Called when the phone asks to close the dialog (the Android back gesture). */
  onDismiss?: () => void;
  /** Drawn over the whole box, behind nothing and touching nothing: confetti, say. */
  decoration?: ReactNode;
};

/** A centred pop-up in the app's own style, instead of the phone's native alert. */
export function PixelDialog({ visible, title, highlight, message, actions, onDismiss, decoration }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <PixelText style={styles.title}>{title}</PixelText>
          {highlight ? <PixelText style={styles.highlight}>{highlight}</PixelText> : null}
          {message ? <BodyText style={styles.message}>{message}</BodyText> : null}
          <View style={styles.actions}>
            {actions.map((action) => (
              <PixelButton
                key={action.label}
                label={action.label}
                variant={action.variant}
                onPress={action.onPress}
              />
            ))}
          </View>
          {decoration ? (
            <View pointerEvents="none" style={styles.decoration}>
              {decoration}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.background,
    borderColor: colors.text,
    borderWidth: 4,
    padding: 20,
    gap: 16,
    overflow: 'hidden',
  },
  title: {
    fontSize: 14,
    lineHeight: 22,
  },
  highlight: {
    color: colors.yellow,
    fontSize: 22,
    lineHeight: 30,
  },
  message: {
    color: colors.text,
  },
  actions: {
    gap: 12,
    marginTop: 4,
  },
  decoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
