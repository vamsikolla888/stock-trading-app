import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/** Tracks foreground/background transitions — useful for pausing sockets or refetching on foreground. */
export function useAppStateStatus(): AppStateStatus {
  const [status, setStatus] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setStatus);
    return () => subscription.remove();
  }, []);

  return status;
}
