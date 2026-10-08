import { useCallback, useMemo, useState } from 'react';

import { confirmAction } from '@/features/settings/lib/confirm';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage, isApiError } from '@/types/api';

import { useSaveBotSettings } from '../hooks';
import {
  ALL_FIELDS,
  armWarning,
  draftFrom,
  isDirty,
  parseField,
  rebaseDraft,
  serverFieldErrors,
  validateDraft,
  type DraftErrors,
  type SettingsDraft,
} from '../lib/settings';
import type { BotNumberKey, BotSettings, BotStatus } from '../types';

export interface SettingsDraftController {
  draft: SettingsDraft | null;
  saved: BotSettings | null;
  dirty: boolean;
  /** Per field: the local range check, else the server's own message from the last save. */
  errors: DraftErrors;
  saving: boolean;
  setEnabled: (enabled: boolean) => void;
  setText: (key: BotNumberKey, text: string) => void;
  discard: () => void;
  save: () => void;
}

/**
 * The Controls tab's editable copy of the bot's settings. It follows the server while untouched
 * and rebases onto any change the server reports (rebaseDraft), so a stop made elsewhere is never
 * undone by saving a cap. Lives in the screen, not the tab, because Save is the screen's sticky
 * footer. Saving waits for the server — nothing here is optimistic.
 */
export function useSettingsDraft(status: BotStatus | undefined): SettingsDraftController {
  const saved = status?.settings ?? null;
  const [state, setState] = useState<{ base: BotSettings; draft: SettingsDraft } | null>(null);
  const [serverErrors, setServerErrors] = useState<DraftErrors>({});
  const mutation = useSaveBotSettings();

  // Adjust during render when the server's settings change (React's "derive from props" path).
  if (saved && state?.base !== saved) {
    setState({
      base: saved,
      draft: state ? rebaseDraft(state.draft, state.base, saved) : draftFrom(saved),
    });
  }

  const draft = state?.draft ?? null;
  const dirty = Boolean(draft && saved && isDirty(draft, saved));

  const errors = useMemo<DraftErrors>(() => {
    if (!draft) return {};
    const out: DraftErrors = {};
    for (const field of ALL_FIELDS) {
      const local = parseField(field, draft.texts[field.key] ?? '').error;
      const message = local ?? serverErrors[field.key];
      if (message) out[field.key] = message;
    }
    return out;
  }, [draft, serverErrors]);

  const setEnabled = useCallback(
    (enabled: boolean) =>
      setState((current) =>
        current ? { ...current, draft: { ...current.draft, enabled } } : current,
      ),
    [],
  );

  const setText = useCallback((key: BotNumberKey, text: string) => {
    setServerErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setState((current) =>
      current
        ? {
            ...current,
            draft: { ...current.draft, texts: { ...current.draft.texts, [key]: text } },
          }
        : current,
    );
  }, []);

  const discard = useCallback(() => {
    setServerErrors({});
    setState((current) => (current ? { ...current, draft: draftFrom(current.base) } : current));
  }, []);

  const { mutate } = mutation;
  const mode = status?.mode ?? 'paper';
  const save = useCallback(() => {
    if (!draft || !saved) return;
    const { body } = validateDraft(draft);
    if (!body) {
      toast.error('Check the highlighted fields', 'Some values are outside what the bot allows.');
      return;
    }
    const send = () =>
      mutate(body, {
        onSuccess: () => {
          setServerErrors({});
          toast.success(
            body.enabled ? `${mode === 'live' ? 'Live' : 'Paper'} trading armed` : 'Settings saved',
            body.enabled ? undefined : 'New entries are off.',
          );
        },
        onError: (error) => {
          setServerErrors(serverFieldErrors(isApiError(error) ? error.fieldErrors : undefined));
          toast.error('Couldn’t save the settings', getErrorMessage(error));
        },
      });
    const warning = armWarning(draft, saved, mode);
    if (warning) {
      confirmAction({
        title: warning.title,
        message: warning.message,
        confirmLabel: 'Arm and save',
        destructive: mode === 'live',
        onConfirm: send,
      });
    } else {
      send();
    }
  }, [draft, saved, mode, mutate]);

  return {
    draft,
    saved,
    dirty,
    errors,
    saving: mutation.isPending,
    setEnabled,
    setText,
    discard,
    save,
  };
}
