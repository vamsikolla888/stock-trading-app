import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useState } from 'react';

import { env } from '@/config/env';

interface BiometricResult {
  success: boolean;
  error?: string;
}

export function useBiometricAuth() {
  const [isChecking, setIsChecking] = useState(false);

  const isAvailable = useCallback(async (): Promise<boolean> => {
    if (!env.enableBiometrics) return false;
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
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
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { isAvailable, authenticate, isChecking };
}
