import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAccountProfile, useUpdateProfile } from '@/features/account/hooks';
import { checkProfileDraft, PROFILE_LIMITS } from '@/features/account/lib/account';
import type { AccountProfile } from '@/features/account/types';
import { TextArea } from '@/features/settings/components/TextArea';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage, isApiError } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** Personal details — the name, phone and short bio on the account (web: Profile › Personal). */
export default function PersonalDetailsScreen() {
  const profile = useAccountProfile();

  return (
    <StackScreen title="Personal details" subtitle="Name, phone and bio">
      {profile.data ? (
        // Keyed by the saved version, so a save (or a refresh from elsewhere) re-seeds the form.
        <PersonalForm key={profile.data.updatedAt} profile={profile.data} />
      ) : profile.isError ? (
        <InlineError
          what="your profile"
          error={profile.error}
          onRetry={() => void profile.refetch()}
        />
      ) : (
        <ListSkeleton rows={3} />
      )}
    </StackScreen>
  );
}

function PersonalForm({ profile }: { profile: AccountProfile }) {
  const router = useRouter();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState({
    displayName: profile.displayName,
    phone: profile.phone,
    bio: profile.bio,
  });
  const [error, setError] = useState<string | null>(null);
  const check = checkProfileDraft(draft, profile);
  const serverField = (field: string) =>
    isApiError(update.error) ? update.error.fieldErrors[field] : undefined;

  const edit = (field: keyof typeof draft) => (value: string) => {
    setError(null);
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = () => {
    if (!check.valid || !check.changed || update.isPending) return;
    update.mutate(
      {
        displayName: draft.displayName.trim(),
        phone: draft.phone.trim(),
        bio: draft.bio.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Profile saved');
          router.back();
        },
        onError: (err) => setError(getErrorMessage(err, 'Couldn’t save your profile.')),
      },
    );
  };

  return (
    <View className="gap-5">
      <Input
        label="Display name"
        placeholder="Your full name"
        value={draft.displayName}
        onChangeText={edit('displayName')}
        maxLength={PROFILE_LIMITS.displayName}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        returnKeyType="next"
        error={check.errors.displayName ?? serverField('displayName')}
        helperText="Shown on your profile instead of your email."
      />
      <Input
        label="Phone number"
        placeholder="+91 98765 43210"
        value={draft.phone}
        onChangeText={edit('phone')}
        maxLength={PROFILE_LIMITS.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={check.errors.phone ?? serverField('phone')}
      />
      <View>
        <TextArea
          label="Short bio"
          placeholder="A short note about your investing focus."
          value={draft.bio}
          onChangeText={edit('bio')}
          maxLength={PROFILE_LIMITS.bio}
        />
        <Text className="mt-1 self-end text-xs text-ink-faint dark:text-ink-dark-faint">
          {draft.bio.length}/{PROFILE_LIMITS.bio}
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label="Save changes"
        size="lg"
        fullWidth
        loading={update.isPending}
        disabled={!check.valid || !check.changed}
        onPress={save}
      />
      <Text className="text-center text-xs text-ink-faint dark:text-ink-dark-faint">
        Last updated{' '}
        {new Date(profile.updatedAt).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </Text>
    </View>
  );
}
