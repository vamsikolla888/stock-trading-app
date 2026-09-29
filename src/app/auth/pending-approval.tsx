import { useLocalSearchParams, useRouter } from 'expo-router';
import Hourglass from 'lucide-react-native/icons/hourglass';
import React from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AuthScreen } from '@/features/auth/components/AuthScreen';
import { StatusPanel } from '@/features/auth/components/StatusPanel';
import { useTheme } from '@/theme/ThemeProvider';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = typeof params.email === 'string' ? params.email : undefined;
  const backToSignIn = () => router.dismissTo('/auth/login');

  return (
    <AuthScreen
      onBack={backToSignIn}
      footer={<Button label="Back to sign in" size="lg" fullWidth onPress={backToSignIn} />}
    >
      <StatusPanel
        icon={<Hourglass size={30} color={colors.link} />}
        title="Request received"
        message={
          <>
            Thanks for signing up
            {email ? (
              <>
                {' with '}
                <Text className="font-semibold text-ink dark:text-ink-dark">{email}</Text>
              </>
            ) : null}
            . Every new account is reviewed by our team — you can sign in as soon as yours is
            approved.
          </>
        }
      />
    </AuthScreen>
  );
}
