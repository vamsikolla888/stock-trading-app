import { useLocalSearchParams, useRouter } from 'expo-router';
import X from 'lucide-react-native/icons/x';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/Tabs';
import { useBrokerCatalog, useBrokerMutations } from '@/features/trading/hooks';
import type { MfaMethod } from '@/features/trading/types';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const MFA_OPTIONS: readonly { key: MfaMethod; label: string }[] = [
  { key: 'otp', label: 'SMS code' },
  { key: 'totp', label: 'Authenticator app' },
];

const SECURE_FIELD = {
  autoCapitalize: 'none',
  autoCorrect: false,
  autoComplete: 'off',
  importantForAutofill: 'no',
} as const;

/**
 * Connect a broker. mStock: credentials → the day's code (SMS or authenticator). Groww and
 * other API-key brokers: key + TOTP secret once; the server renews the daily token itself.
 */
export default function BrokerConnectScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ broker: string; step?: string }>();
  const catalog = useBrokerCatalog();
  const broker = catalog.data?.find((entry) => entry.id === params.broker);
  const isMstock =
    (broker?.auth ?? (params.broker === 'mstock' ? 'mstock-login' : 'api-key-totp')) ===
    'mstock-login';
  const { connectMstock, verifyMstock, connectApiKey } = useBrokerMutations();

  const [step, setStep] = useState<'credentials' | 'verify'>(
    params.step === 'verify' ? 'verify' : 'credentials',
  );
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState({
    apiKey: '',
    checksum: '',
    username: '',
    password: '',
    totpSecret: '',
    code: '',
  });
  const [mfaMethod, setMfaMethod] = useState<MfaMethod>('otp');
  const set = (key: keyof typeof fields) => (value: string) => {
    setError(null);
    setFields((current) => ({ ...current, [key]: value }));
  };

  const label = broker?.label ?? params.broker;
  const done = () => {
    toast.success(`${label} connected`);
    router.back();
  };
  const fail = (err: unknown) => setError(getErrorMessage(err));

  const submitMstock = () =>
    connectMstock.mutate(
      {
        apiKey: fields.apiKey.trim(),
        checksum: fields.checksum.trim(),
        username: fields.username.trim(),
        password: fields.password,
        mfaMethod,
      },
      {
        onSuccess: (result) => (result.status === 'connected' ? done() : setStep('verify')),
        onError: fail,
      },
    );

  const submitCode = () =>
    verifyMstock.mutate(fields.code.trim(), { onSuccess: done, onError: fail });

  const submitApiKey = () =>
    connectApiKey.mutate(
      {
        broker: params.broker,
        payload: {
          apiKey: fields.apiKey.trim(),
          totpSecret: fields.totpSecret.replace(/\s+/g, '').toUpperCase(),
        },
      },
      { onSuccess: done, onError: fail },
    );

  const mstockReady = Boolean(
    fields.apiKey.trim() && fields.checksum.trim() && fields.username.trim() && fields.password,
  );
  const codeReady = /^\d{4,8}$/.test(fields.code.trim());
  const apiKeyReady =
    fields.apiKey.trim().length >= 8 &&
    /^[A-Z2-7]{16,}=*$/.test(fields.totpSecret.replace(/\s+/g, '').toUpperCase());

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-4">
        <View className="flex-1">
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-ink dark:text-ink-dark"
          >
            {step === 'verify' ? `Verify ${label}` : `Connect ${label}`}
          </Text>
          {broker?.sessionNote ? (
            <Text
              className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
              numberOfLines={2}
            >
              {broker.sessionNote}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-sunk dark:bg-surface-sunk-dark"
        >
          <X size={18} color={colors.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {error ? <Banner tone="error" message={error} /> : null}

          {step === 'verify' ? (
            <>
              <Text className="text-sm leading-5 text-ink-muted dark:text-ink-dark-muted">
                Enter today’s code from{' '}
                {mfaMethod === 'totp' ? 'your authenticator app' : 'the SMS mStock sent you'}.
              </Text>
              <Input
                label="Verification code"
                value={fields.code}
                onChangeText={(text) => set('code')(text.replace(/\D/g, '').slice(0, 8))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => codeReady && submitCode()}
              />
              <Button
                label="Verify"
                size="lg"
                fullWidth
                disabled={!codeReady}
                loading={verifyMstock.isPending}
                onPress={submitCode}
              />
            </>
          ) : isMstock ? (
            <>
              <Input
                label="API key"
                value={fields.apiKey}
                onChangeText={set('apiKey')}
                {...SECURE_FIELD}
              />
              <Input
                label="Checksum"
                value={fields.checksum}
                onChangeText={set('checksum')}
                secureToggle
                {...SECURE_FIELD}
              />
              <Input
                label="mStock user ID"
                value={fields.username}
                onChangeText={set('username')}
                {...SECURE_FIELD}
              />
              <Input
                label="mStock password"
                value={fields.password}
                onChangeText={set('password')}
                secureToggle
                {...SECURE_FIELD}
              />
              <View>
                <Text className="mb-1.5 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
                  Daily code via
                </Text>
                <SegmentedControl items={MFA_OPTIONS} value={mfaMethod} onChange={setMfaMethod} />
              </View>
              <Button
                label="Continue"
                size="lg"
                fullWidth
                disabled={!mstockReady}
                loading={connectMstock.isPending}
                onPress={submitMstock}
              />
            </>
          ) : (
            <>
              <Input
                label="API key"
                value={fields.apiKey}
                onChangeText={set('apiKey')}
                {...SECURE_FIELD}
              />
              <Input
                label="TOTP secret"
                helperText="The base32 secret shown when you enabled API access"
                value={fields.totpSecret}
                onChangeText={set('totpSecret')}
                secureToggle
                {...SECURE_FIELD}
              />
              <Button
                label="Connect"
                size="lg"
                fullWidth
                disabled={!apiKeyReady}
                loading={connectApiKey.isPending}
                onPress={submitApiKey}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
