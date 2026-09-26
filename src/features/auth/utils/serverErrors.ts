import * as Haptics from 'expo-haptics';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import type { BannerTone } from '@/components/ui/Banner';
import { getErrorMessage, isApiError } from '@/types/api';

export interface ServerErrorBanner {
  tone: BannerTone;
  title?: string;
  message: string;
}

/**
 * Puts server validation messages under the fields they belong to, and returns what
 * should be shown in the form-level banner — null when every problem was attached to
 * a field (a banner repeating "email already exists" would just be noise).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): ServerErrorBanner | null {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

  if (!isApiError(error)) {
    return { tone: 'error', message: getErrorMessage(error) };
  }

  let mappedAny = false;
  for (const field of fields) {
    const message = error.fieldErrors[field];
    if (message) {
      setError(field, { type: 'server', message }, { shouldFocus: !mappedAny });
      mappedAny = true;
    }
  }
  const allMapped = Object.keys(error.fieldErrors).every((key) =>
    (fields as readonly string[]).includes(key),
  );
  if (mappedAny && allMapped) return null;

  if (error.isRateLimited) {
    return { tone: 'warning', title: 'Please slow down', message: error.message };
  }
  if (error.isNetworkError) {
    return { tone: 'error', title: "You're offline", message: error.message };
  }
  // Pending/rejected approval arrive as AUTH_INVALID like a wrong password; the server's
  // wording is the only distinguishing signal, and it only changes the banner's tone.
  if (/approv/i.test(error.message)) {
    return { tone: 'warning', title: 'Account not active yet', message: error.message };
  }
  return { tone: 'error', message: error.message };
}
