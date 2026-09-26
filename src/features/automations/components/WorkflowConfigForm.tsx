import Plus from 'lucide-react-native/icons/plus';
import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Section } from '@/components/ui/Section';
import { useUpdateWorkflowConfig } from '@/features/automations/hooks';
import {
  buildConfigPayload,
  duplicateEnvKeys,
  toEnvVarDrafts,
  type EnvVarDraft,
} from '@/features/automations/lib/workflows';
import type { WorkflowDetail } from '@/features/automations/types';
import { TextArea } from '@/features/settings/components/TextArea';
import { confirmAction } from '@/features/settings/lib/confirm';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const FIELD = { autoCapitalize: 'none', autoCorrect: false, autoComplete: 'off' } as const;

let draftSeq = 0;

/** Configure tab: the platform-side description and tracked environment variables. */
export function WorkflowConfigForm({ workflow }: { workflow: WorkflowDetail }) {
  const { colors } = useTheme();
  const save = useUpdateWorkflowConfig();
  const [notes, setNotes] = useState(workflow.notes);
  const [drafts, setDrafts] = useState<EnvVarDraft[]>(() => toEnvVarDrafts(workflow.envVars));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh copy of the workflow (a refetch, a save elsewhere) reseeds the form — but only a
  // clean one: a background refetch must never wipe edits in progress.
  const [seededFrom, setSeededFrom] = useState(workflow);
  if (seededFrom !== workflow) {
    setSeededFrom(workflow);
    if (!dirty) {
      setNotes(workflow.notes);
      setDrafts(toEnvVarDrafts(workflow.envVars));
    }
  }

  const edit = () => {
    setDirty(true);
    setError(null);
  };
  const update = (id: string, patch: Partial<EnvVarDraft>) => {
    edit();
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  };
  const add = () => {
    edit();
    draftSeq += 1;
    setDrafts((current) => [
      ...current,
      {
        id: `new-${draftSeq}`,
        key: '',
        secret: false,
        value: '',
        touched: true,
        hasValue: false,
        wasSecret: false,
      },
    ]);
  };
  const remove = (id: string) => {
    edit();
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const duplicates = duplicateEnvKeys(drafts);

  const submit = () =>
    confirmAction({
      title: 'Save changes?',
      message: `The description and variables for “${workflow.name}” are updated for everyone.`,
      confirmLabel: 'Save',
      onConfirm: () =>
        save.mutate(
          { id: workflow.id, body: buildConfigPayload(notes, drafts) },
          {
            onSuccess: (updated) => {
              setDirty(false);
              setNotes(updated.notes);
              setDrafts(toEnvVarDrafts(updated.envVars));
              toast.success('Saved', 'Workflow settings updated.');
            },
            onError: (err) => setError(getErrorMessage(err, 'Couldn’t save these settings.')),
          },
        ),
    });

  return (
    <View>
      <Section title="Description" className="mt-5">
        <TextArea
          label="What this workflow does"
          value={notes}
          maxLength={2000}
          placeholder="n8n has no description field, so this lives on the platform."
          onChangeText={(text) => {
            edit();
            setNotes(text);
          }}
        />
      </Section>

      <Section
        title="Variables"
        action={drafts.length < 50 ? { label: 'Add', onPress: add } : undefined}
      >
        {drafts.length === 0 ? (
          <View className="items-center gap-3 rounded-card border border-dashed border-line-strong px-4 py-6 dark:border-line-dark-strong">
            <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
              No variables tracked for this workflow yet.
            </Text>
            <Button
              label="Add variable"
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={16} color={colors.link} />}
              onPress={add}
            />
          </View>
        ) : (
          <View className="gap-3">
            {drafts.map((draft) => {
              const keepsSecret = draft.wasSecret && draft.hasValue && draft.value === '';
              return (
                <View
                  key={draft.id}
                  className="gap-3 rounded-card border border-line bg-surface p-3.5 dark:border-line-dark dark:bg-surface-dark"
                >
                  <Input
                    label="Key"
                    value={draft.key}
                    maxLength={120}
                    placeholder="API_TOKEN"
                    onChangeText={(key) => update(draft.id, { key })}
                    error={
                      duplicates.includes(draft.key.trim()) ? 'This key is used twice' : undefined
                    }
                    {...FIELD}
                  />
                  <Input
                    label="Value"
                    value={draft.value}
                    maxLength={2000}
                    placeholder={keepsSecret ? '•••••••• (unchanged)' : 'Value'}
                    secureToggle={draft.secret}
                    helperText={keepsSecret ? 'Leave empty to keep the stored secret.' : undefined}
                    onChangeText={(value) => update(draft.id, { value, touched: true })}
                    {...FIELD}
                  />
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1 flex-row items-center gap-2.5">
                      <Switch
                        value={draft.secret}
                        onValueChange={(secret) => update(draft.id, { secret })}
                        trackColor={{ true: colors.primary, false: colors.borderStrong }}
                        thumbColor={colors.primaryText}
                        ios_backgroundColor={colors.borderStrong}
                        accessibilityLabel={`Treat ${draft.key || 'this variable'} as a secret`}
                      />
                      <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
                        Secret — never shown again
                      </Text>
                    </View>
                    <Button
                      label="Remove"
                      variant="ghost"
                      size="sm"
                      accessibilityLabel={`Remove ${draft.key || 'variable'}`}
                      onPress={() => remove(draft.id)}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Section>

      {error ? <Banner tone="error" message={error} className="mt-5" /> : null}

      <Button
        label={dirty ? 'Save changes' : 'No changes'}
        size="lg"
        fullWidth
        className="mt-5"
        disabled={!dirty || duplicates.length > 0}
        loading={save.isPending}
        onPress={submit}
      />
      <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Triggers and steps are edited in n8n itself. Secret values are write-only: once saved they
        are never sent back to any device.
      </Text>
    </View>
  );
}
