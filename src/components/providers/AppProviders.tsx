import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ThemedToast } from '@/components/common/ThemedToast';
import { appConfig } from '@/config/app';
import { appVersion } from '@/config/env';
import { queryPersister } from '@/lib/query/persister';
import { queryClient } from '@/lib/query/queryClient';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister: queryPersister,
              maxAge: appConfig.query.gcTimeMs,
              // A new app version may read different response shapes — never paint it
              // from a cache written by the previous one.
              buster: appVersion,
            }}
          >
            <ThemeProvider>
              <BottomSheetModalProvider>
                <ThemedStatusBar />
                {children}
                <ThemedToast />
              </BottomSheetModalProvider>
            </ThemeProvider>
          </PersistQueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
