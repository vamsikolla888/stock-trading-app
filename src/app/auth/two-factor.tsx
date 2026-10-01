import * as Haptics from 'expo-haptics';
import { Redirect, useRouter } from 'expo-router';
import KeyRound from 'lucide-react-native/icons/key-round';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import TimerOff from 'lucide-react-native/icons/timer-off';
import React, { useRef, useState } from 'react';
import { Pressable, Text, View, type TextInput } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  challengeSecondsLeft,
  isMfaCodeReady,
  normaliseMfaCode,
  useAuthFlowStore,
} from '@/features/auth/authFlowStore';
import { AuthScreen } from '@/features/auth/components/AuthScreen';
import { OtpInput } from '@/features/auth/components/OtpInput';
import { StatusPanel } from '@/features/auth/components/StatusPanel';
import { useVerifyMfa } from '@/features/auth/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage, isApiError } from '@/types/api';

type Mode = 'totp' | 'recovery';

/** The server gives up on a challenge after this many wrong codes (mfa.service.ts). */
const LOCKED_OUT = /too many incorrect|sign in again|expired|already been used/i;

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Second step of a two-factor sign-in. The password was accepted; this exchanges the in-memory
 * challenge for a session with a six-digit authenticator code, or one of the recovery codes
 * saved when two-factor was turned on. Six digits submit on their own — no extra tap.
 */
export default function TwoFactorScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const challenge = useAuthFlowStore((state) => state.challenge);
  const clearChallenge = useAuthFlowStore((state) => state.clearChallenge);
  const verify = useVerifyMfa();
  const now = useNow(1_000);
  const inputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<Mode>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dead, setDead] = useState<string | null>(null);

  // Reached without a pending challenge (a cold start, a deep link): there is nothing to verify.
  if (!challenge) return <Redirect href="/auth/login" />;

  const secondsLeft = challengeSecondsLeft(challenge.expiresAt, now);
  const expired = secondsLeft <= 0;

  const backToSignIn = () => {
    clearChallenge();
    router.dismissTo('/auth/login');
  };

  const submit = (value = code) => {
    if (verify.isPending || expired || dead || !isMfaCodeReady(value, mode)) return;
    setError(null);
    verify.mutate(
      { challengeToken: challenge.challengeToken, code: value },
      {
        // Success needs nothing here: the session store flips and the guards move us into the app.
        onError: (err) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          const message = getErrorMessage(err, 'We could not verify that code. Try again.');
          // A locked, used or expired challenge can never succeed — offer a fresh sign-in.
          if (isApiError(err) && err.status === 401 && LOCKED_OUT.test(message)) {
            setDead(message);
            return;
          }
          setError(message);
          setCode('');
          inputRef.current?.focus();
        },
      },
    );
  };

  const switchMode = () => {
    setMode((current) => (current === 'totp' ? 'recovery' : 'totp'));
    setCode('');
    setError(null);
  };

  if (dead || expired) {
    return (
      <AuthScreen
        onBack={backToSignIn}
        footer={<Button label="Sign in again" size="lg" fullWidth onPress={backToSignIn} />}
      >
        <StatusPanel
          tone="warning"
          icon={<TimerOff size={30} color={colors.warning} />}
          title={dead ? 'Let’s start over' : 'This sign-in timed out'}
          message={
            dead ??
            'For your security, a sign-in waits five minutes for its code. Enter your password again to get a fresh one.'
          }
        />
      </AuthScreen>
    );
  }

  const ready = isMfaCodeReady(code, mode);

  return (
    <AuthScreen
      onBack={backToSignIn}
      footer={
        <View className="gap-1">
          <Button
            label="Verify and continue"
            size="lg"
            fullWidth
            loading={verify.isPending}
            disabled={!ready}
            onPress={() => submit()}
          />
          <Button
            label="Back to sign in"
            variant="ghost"
            size="lg"
            fullWidth
            onPress={backToSignIn}
          />
        </View>
      }
    >
      <View className="mb-6 mt-2 items-center gap-3">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-wash dark:bg-brand-wash-dark">
          {mode === 'totp' ? (
            <ShieldCheck size={30} color={colors.link} />
          ) : (
            <KeyRound size={28} color={colors.link} />
          )}
        </View>
        <Text
          accessibilityRole="header"
          className="text-center text-[24px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.6 }}
        >
          Confirm it’s you
        </Text>
        <Text className="max-w-[340px] text-center text-[15px] leading-[22px] text-ink-muted dark:text-ink-dark-muted">
          {mode === 'totp'
            ? 'Enter the six-digit code from your authenticator app for '
            : 'Enter one of the recovery codes you saved when you turned on two-factor for '}
          <Text className="font-semibold text-ink dark:text-ink-dark">{challenge.email}</Text>.
        </Text>
      </View>

      <View className="gap-4">
        {mode === 'totp' ? (
          <OtpInput
            ref={inputRef}
            value={code}
            onChangeText={(value) => {
              if (error) setError(null);
              setCode(value);
            }}
            onComplete={submit}
            error={Boolean(error)}
            editable={!verify.isPending}
            autoFocus
          />
        ) : (
          <Input
            ref={inputRef}
            label="Recovery code"
            placeholder="XXXX-XXXX-XXXX"
            value={code}
            onChangeText={(text) => {
              if (error) setError(null);
              setCode(normaliseMfaCode(text, 'recovery'));
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="go"
            onSubmitEditing={() => submit()}
            editable={!verify.isPending}
            helperText="Each recovery code works once."
            autoFocus
          />
        )}

        {error ? <Banner tone="error" message={error} /> : null}

        <View className="flex-row items-center justify-between gap-3">
          <Text
            className="text-[13px] text-ink-muted dark:text-ink-dark-muted"
            style={{ fontVariant: ['tabular-nums'] }}
            accessibilityLabel={`Expires in ${Math.ceil(secondsLeft / 60)} minutes`}
          >
            Expires in {clock(secondsLeft)}
          </Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={switchMode}
            className="active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              {mode === 'totp' ? 'Use a recovery code' : 'Use authenticator code'}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthScreen>
  );
}
