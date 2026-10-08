import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appConfig } from '@/config/app';
import { appStorage, isExpoGo } from '@/lib/storage/appStorage';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/types/api';

import { settingsApi } from './api';
import { settingsKeys, usePushDevices, useSendPushTest } from './hooks';
import {
  notificationWord,
  pushDeviceLabel,
  pushTestMessage,
  type NotificationWord,
} from './lib/preferences';

/**
 * Push alerts for THIS phone (web: push-notification.service.ts + Preferences' usePushState).
 *
 * The server delivers through Firebase Cloud Messaging, which takes the native FCM token an
 * Android phone hands out — so push works on a real Android phone running a build with Firebase
 * set up. An iPhone's token is an APNs token FCM cannot address, Expo Go has no push since SDK 53,
 * and the web build has no service worker: those are "Unavailable", said plainly, never a switch
 * that does nothing. Alerts still collect in the app under Alerts & notifications everywhere.
 */
const PUSH_SUPPORTED = Platform.OS === 'android' && Device.isDevice && !isExpoGo;

interface Registration {
  token: string;
  registeredAt: string;
}

interface PushRegistrationState {
  /** The token this phone registered, per account — another account signing in starts at Off. */
  byUser: Record<string, Registration>;
  save: (userId: string, registration: Registration) => void;
  clear: (userId: string) => void;
}

const usePushRegistrationStore = create<PushRegistrationState>()(
  persist(
    (set) => ({
      byUser: {},
      save: (userId, registration) =>
        set((state) => ({ byUser: { ...state.byUser, [userId]: registration } })),
      clear: (userId) =>
        set((state) => {
          const next = { ...state.byUser };
          delete next[userId];
          return { byUser: next };
        }),
    }),
    { name: 'push-registration', storage: createJSONStorage(() => appStorage) },
  ),
);

/** Loaded on demand: a native module the app's cold start never needs. */
function loadNotifications() {
  return import('expo-notifications');
}

/** The OS's answer for this app — 'granted' | 'denied' | 'undetermined', null if unreadable. */
async function osPermission(): Promise<string | null> {
  if (!PUSH_SUPPORTED) return null;
  try {
    const Notifications = await loadNotifications();
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return null;
  }
}

type EnableResult = 'enabled' | 'denied' | 'unavailable';

export interface PushState {
  supported: boolean;
  /** This phone's token is registered with the account and the OS still allows alerts. */
  enabledHere: boolean;
  word: NotificationWord;
  /** The OS permission: 'granted' | 'denied' | 'undetermined', null until read. */
  permission: string | null;
  devices: ReturnType<typeof usePushDevices>;
  message: string | null;
  /** The action in flight — one at a time. */
  pending: 'enable' | 'disable' | 'test' | null;
  enable: () => void;
  disable: () => void;
  test: () => void;
  /** Re-reads the OS permission and the server's device list (pull to refresh). */
  refresh: () => Promise<unknown>;
}

/** Push state for this phone — shared by the glance tiles and the Notifications panel. */
export function usePushState(): PushState {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const registration = usePushRegistrationStore((state) => state.byUser[userId] ?? null);
  const saveRegistration = usePushRegistrationStore((state) => state.save);
  const clearRegistration = usePushRegistrationStore((state) => state.clear);
  const devices = usePushDevices();
  const sendTest = useSendPushTest();
  const [permission, setPermission] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Alerts can be allowed or blocked in the phone's settings while the app is in the background.
  useEffect(() => {
    if (!PUSH_SUPPORTED) return undefined;
    let alive = true;
    const read = () =>
      void osPermission().then((status) => {
        if (alive) setPermission(status);
      });
    read();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') read();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  const invalidateDevices = () =>
    queryClient.invalidateQueries({ queryKey: settingsKeys.pushDevices });

  const enable = useMutation({
    mutationFn: async (): Promise<EnableResult> => {
      const Notifications = await loadNotifications();
      let status = (await Notifications.getPermissionsAsync()).status;
      if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
      setPermission(status);
      if (status !== 'granted') return 'denied';

      await Notifications.setNotificationChannelAsync('default', {
        name: 'Alerts',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      let token: string;
      try {
        const device = await Notifications.getDevicePushTokenAsync();
        token = typeof device.data === 'string' ? device.data : '';
      } catch {
        // No Firebase configuration in this build — the OS hands out no FCM token.
        return 'unavailable';
      }
      if (token.length < 20) return 'unavailable';

      await settingsApi.registerPushDevice(
        token,
        pushDeviceLabel({
          appName: appConfig.name,
          os: Platform.OS,
          osVersion: Platform.Version,
          model: Device.modelName,
        }),
      );
      saveRegistration(userId, { token, registeredAt: new Date().toISOString() });
      return 'enabled';
    },
    onMutate: () => setMessage(null),
    onSuccess: (result) => {
      if (result === 'enabled') {
        setMessage('Notifications are on for this phone.');
        void invalidateDevices();
      } else if (result === 'denied') {
        setMessage('Blocked for this app — allow notifications in your phone’s settings.');
      } else {
        setMessage('This version of the app can’t receive push alerts yet.');
      }
    },
    onError: (error) =>
      setMessage(getErrorMessage(error, 'Couldn’t turn notifications on. Please try again.')),
  });

  const disable = useMutation({
    mutationFn: async () => {
      if (registration) await settingsApi.unregisterPushDevice(registration.token);
    },
    onMutate: () => setMessage(null),
    onSuccess: () => {
      clearRegistration(userId);
      setMessage('Notifications are off for this phone.');
      void invalidateDevices();
    },
    onError: (error) =>
      setMessage(getErrorMessage(error, 'Couldn’t turn notifications off. Please try again.')),
  });

  const enabledHere =
    PUSH_SUPPORTED && registration !== null && (permission === null || permission === 'granted');

  return {
    supported: PUSH_SUPPORTED,
    enabledHere,
    word: notificationWord({ supported: PUSH_SUPPORTED, enabledHere, permission }),
    permission,
    devices,
    message,
    pending: enable.isPending
      ? 'enable'
      : disable.isPending
        ? 'disable'
        : sendTest.isPending
          ? 'test'
          : null,
    enable: () => enable.mutate(),
    disable: () => disable.mutate(),
    test: () => {
      setMessage(null);
      sendTest.mutate(undefined, {
        onSuccess: (result) => setMessage(pushTestMessage(result)),
        onError: (error) =>
          setMessage(getErrorMessage(error, 'The test notification couldn’t be sent.')),
      });
    },
    refresh: () => Promise.all([osPermission().then(setPermission), devices.refetch()]),
  };
}
