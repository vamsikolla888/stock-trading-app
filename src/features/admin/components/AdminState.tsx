import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import React from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { IconTile } from '@/components/ui/IconTile';
import { isAdminDenied } from '@/features/admin/lib/access';

/** Shown to non-admins (or a stale admin role the server no longer honours). */
export function AdminOnlyNotice({ message }: { message?: string }) {
  return (
    <View className="items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 dark:border-line-dark dark:bg-surface-dark">
      <IconTile Icon={ShieldAlert} tone="amber" size="lg" />
      <Text
        accessibilityRole="header"
        className="text-center text-base font-bold text-ink dark:text-ink-dark"
      >
        Admins only
      </Text>
      <Text className="max-w-[300px] text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {message ??
          'This area is for platform administrators. Ask an administrator if you need access.'}
      </Text>
    </View>
  );
}

/** Error state for an admin query — "Admins only" when the server refused the role. */
export function AdminQueryError({
  error,
  what,
  onRetry,
}: {
  error: unknown;
  what: string;
  onRetry?: () => void;
}) {
  if (isAdminDenied(error))
    return <AdminOnlyNotice message="Your account no longer has administrator access." />;
  return <InlineError what={what} error={error} onRetry={onRetry} />;
}
