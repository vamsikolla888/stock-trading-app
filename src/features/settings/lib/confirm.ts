import { Alert } from 'react-native';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button — deletes, disconnects, kill switch. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * The one confirmation pattern for operator and account actions (run a workflow, toggle a
 * switch, delete, disconnect). Native alert, cancel first so a reflexive tap is harmless.
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmOptions): void {
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
