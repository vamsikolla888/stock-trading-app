import { Stack, useRouter } from 'expo-router';
import React from 'react';

import { ErrorScreen } from '@/components/common/ErrorScreen';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <ErrorScreen
        fullScreen
        title="Page not found"
        message="This link doesn't lead anywhere in the app — it may be out of date."
        onHome={() => router.replace('/')}
      />
    </>
  );
}
