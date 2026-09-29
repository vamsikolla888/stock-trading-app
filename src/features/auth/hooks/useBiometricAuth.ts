import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useState } from 'react';

import { env } from '@/config/env';

interface BiometricResult {
  success: boolean;
  error?: string;
}

export function useBiometricAuth() {
  const [isChecking, setIsChecking] = useState(false);

  // Both resolve rather than reject: callers run them from switch and button handlers,
  // where a rejected native call would surface as an unhandled promise error.
  const isAvailable = useCallback(async (): Promise<boolean> => {
    if (!env.enableBiometrics) return false;
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      return hasHardware && isEnrolled;
    } catch {
      return false;
    }
  }, []);

  const authenticate = useCallback(async (promptMessage = 'Sign in'): Promise<BiometricResult> => {
    setIsChecking(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch {
      return { success: false, error: 'unknown' };
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { isAvailable, authenticate, isChecking };
}
