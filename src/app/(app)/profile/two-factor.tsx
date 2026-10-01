import * as Haptics from 'expo-haptics';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import ExternalLink from 'lucide-react-native/icons/external-link';
import KeyRound from 'lucide-react-native/icons/key-round';
import Share2 from 'lucide-react-native/icons/share-2';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import ShieldOff from 'lucide-react-native/icons/shield-off';
import React, { useRef, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  Text,
  View,
  type TextInput,
} from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { Input } from '@/components/ui/Input';
import { appConfig } from '@/config/app';
import {
  useAccountProfile,
  useAccountSecurity,
  useBeginMfaSetup,
  useConfirmMfaSetup,
  useDisableMfa,
  useRegenerateRecoveryCodes,
} from '@/features/account/hooks';
import { groupSecret, recoveryCodesText } from '@/features/account/lib/account';
import type { MfaSetup, MfaStatus } from '@/features/account/types';
import { challengeSecondsLeft, normaliseMfaCode } from '@/features/auth/authFlowStore';
import { OtpInput } from '@/features/auth/components/OtpInput';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/lib/utils/toast';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const MONO = {
  fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  fontVariant: ['tabular-nums' as const],
};
/** Below this many unused recovery codes, nudge the person to replace them. */
const LOW_RECOVERY_CODES = 3;

type Step =
  | { kind: 'idle' }
  | { kind: 'password'; purpose: 'setup' }
  | { kind: 'setup'; setup: MfaSetup }
  | { kind: 'protected'; purpose: 'disable' | 'recovery' }
  | { kind: 'codes'; codes: string[]; fresh: boolean };

/**
 * Two-factor authentication (web: Profile › Two-factor auth). After the password, every
 * sign-in asks for a fresh six-digit code from an authenticator app. Setting it up proves the
 * password first, links the authenticator — on the same phone, via its otpauth:// link — then
 * confirms one code before anything is switched on. Turning it off or replacing the recovery
 * codes needs the password AND a current code.
 */
export default function TwoFactorScreen() {
  const security = useAccountSecurity();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const mfa = security.data?.mfa;

  return (
    <StackScreen
      title="Two-factor authentication"
      subtitle="A code from your phone at every sign-in"
      onRefresh={step.kind === 'idle' ? () => security.refetch() : undefined}
    >
      {security.isPending ? (
        <ListSkeleton rows={2} />
      ) : !mfa ? (
        <InlineError
          what="your security settings"
          error={security.error}
          onRetry={() => void security.refetch()}
        />
      ) : step.kind === 'codes' ? (
        <RecoveryCodes
          codes={step.codes}
          fresh={step.fresh}
          onDone={() => setStep({ kind: 'idle' })}
        />
      ) : step.kind === 'password' ? (
        <PasswordStep
          onCancel={() => setStep({ kind: 'idle' })}
          onReady={(setup) => setStep({ kind: 'setup', setup })}
        />
      ) : step.kind === 'setup' ? (
        <SetupStep
          setup={step.setup}
          onCancel={() => setStep({ kind: 'idle' })}
          onEnabled={(codes) => setStep({ kind: 'codes', codes, fresh: true })}
        />
      ) : step.kind === 'protected' ? (
        <ProtectedStep
          purpose={step.purpose}
          onCancel={() => setStep({ kind: 'idle' })}
          onDone={(codes) =>
            setStep(codes ? { kind: 'codes', codes, fresh: false } : { kind: 'idle' })
          }
        />
      ) : (
        <Overview
          mfa={mfa}
          onSetup={() => setStep({ kind: 'password', purpose: 'setup' })}
          onDisable={() => setStep({ kind: 'protected', purpose: 'disable' })}
          onReplaceCodes={() => setStep({ kind: 'protected', purpose: 'recovery' })}
        />
      )}
    </StackScreen>
  );
}

/* ── Overview ────────────────────────────────────────────────────────────────────────── */

function Overview({
  mfa,
  onSetup,
  onDisable,
  onReplaceCodes,
}: {
  mfa: MfaStatus;
  onSetup: () => void;
  onDisable: () => void;
  onReplaceCodes: () => void;
}) {
  const low = mfa.enabled && mfa.recoveryCodesRemaining <= LOW_RECOVERY_CODES;
  return (
    <View className="gap-5">
      <View className="items-center gap-3 rounded-card border border-line bg-surface px-5 py-6 dark:border-line-dark dark:bg-surface-dark">
        <IconTile
          Icon={mfa.enabled ? ShieldCheck : ShieldOff}
          tone={mfa.enabled ? 'green' : 'amber'}
          size="lg"
        />
        <Badge label={mfa.enabled ? 'On' : 'Off'} variant={mfa.enabled ? 'success' : 'warning'} />
        <Text className="text-center text-lg font-bold text-ink dark:text-ink-dark">
          {mfa.enabled ? 'Your sign-ins are protected' : 'Add a second step to sign-in'}
        </Text>
        <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {mfa.enabled
            ? `Turned on ${mfa.enabledAt ? new Date(mfa.enabledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}. ${mfa.recoveryCodesRemaining} recovery code${mfa.recoveryCodesRemaining === 1 ? '' : 's'} left.`
            : 'After your password, each sign-in asks for a six-digit code from an authenticator app — Google Authenticator, Microsoft Authenticator, Authy or 1Password.'}
        </Text>
      </View>

      {low ? (
        <Banner
          tone="warning"
          title="Running low on recovery codes"
          message="Replace them so you can still get in if you lose this phone."
        />
      ) : null}

      {mfa.enabled ? (
        <View className="gap-2">
          <Button
            label="Replace recovery codes"
            variant="secondary"
            size="lg"
            fullWidth
            onPress={onReplaceCodes}
          />
          <Button
            label="Turn off two-factor"
            variant="outline"
            size="lg"
            fullWidth
            onPress={onDisable}
          />
        </View>
      ) : (
        <Button label="Set up authenticator" size="lg" fullWidth onPress={onSetup} />
      )}

      <Text className="text-center text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        Turning two-factor on or off signs out your other devices.
      </Text>
    </View>
  );
}

/* ── Setup: password → link → confirm ────────────────────────────────────────────────── */

function PasswordStep({
  onCancel,
  onReady,
}: {
  onCancel: () => void;
  onReady: (setup: MfaSetup) => void;
}) {
  const begin = useBeginMfaSetup();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!password || begin.isPending) return;
    setError(null);
    begin.mutate(password, {
      onSuccess: onReady,
      onError: (err) => setError(getErrorMessage(err, 'Couldn’t start the setup.')),
    });
  };

  return (
    <View className="gap-5">
      <StepHeading
        step="Step 1 of 3"
        title="Confirm your password"
        body="So nobody holding your unlocked phone can link their own authenticator to your account."
      />
      <Input
        label="Current password"
        value={password}
        onChangeText={(text) => {
          setError(null);
          setPassword(text);
        }}
        secureToggle
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="next"
        onSubmitEditing={submit}
      />
      {error ? <Banner tone="error" message={error} /> : null}
      <View className="gap-2">
        <Button
          label="Continue"
          size="lg"
          fullWidth
          loading={begin.isPending}
          disabled={!password}
          onPress={submit}
        />
        <Button label="Cancel" variant="ghost" size="lg" fullWidth onPress={onCancel} />
      </View>
    </View>
  );
}

function SetupStep({
  setup,
  onCancel,
  onEnabled,
}: {
  setup: MfaSetup;
  onCancel: () => void;
  onEnabled: (codes: string[]) => void;
}) {
  const { colors } = useTheme();
  const confirm = useConfirmMfaSetup();
  const now = useNow(1_000);
  const codeRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const secondsLeft = challengeSecondsLeft(setup.expiresAt, now);

  const openAuthenticator = async () => {
    try {
      await Linking.openURL(setup.otpauthUri);
    } catch {
      toast.info(
        'No authenticator app found',
        'Install Google Authenticator, Microsoft Authenticator, Authy or 1Password — or enter the setup key by hand.',
      );
    }
  };

  const shareKey = () => void Share.share({ message: setup.secret }).catch(() => undefined);

  const submit = (value = code) => {
    if (!/^\d{6}$/.test(value) || confirm.isPending) return;
    setError(null);
    confirm.mutate(
      { setupToken: setup.setupToken, code: value },
      {
        onSuccess: ({ recoveryCodes }) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          toast.success('Two-factor is on');
          onEnabled(recoveryCodes);
        },
        onError: (err) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError(getErrorMessage(err, 'That code didn’t match. Try the current one.'));
          setCode('');
          codeRef.current?.focus();
        },
      },
    );
  };

  if (secondsLeft <= 0) {
    return (
      <View className="gap-4">
        <Banner
          tone="warning"
          title="This setup timed out"
          message="A setup waits ten minutes for its first code. Start again — it only takes a moment."
        />
        <Button label="Start again" size="lg" fullWidth onPress={onCancel} />
      </View>
    );
  }

  return (
    <View className="gap-6">
      <View className="gap-4">
        <StepHeading
          step="Step 2 of 3"
          title="Link your authenticator"
          body="Add this account to your authenticator app. It then shows a new six-digit code every 30 seconds."
        />
        <Button
          label="Open authenticator app"
          size="lg"
          fullWidth
          leftIcon={<ExternalLink size={18} color="#ffffff" />}
          onPress={() => void openAuthenticator()}
        />
        <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            Or type this setup key into the app
          </Text>
          <Text
            selectable
            className="mt-1.5 text-[17px] font-semibold text-ink dark:text-ink-dark"
            style={[MONO, { letterSpacing: 1 }]}
          >
            {groupSecret(setup.secret)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={shareKey}
            hitSlop={8}
            className="mt-2 flex-row items-center gap-1.5 self-start active:opacity-60"
          >
            <Share2 size={14} color={colors.link} />
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              Copy or share key
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showQr }}
          onPress={() => setShowQr((open) => !open)}
          className="flex-row items-center justify-between py-1 active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
            Setting up on another device? Show QR code
          </Text>
          {showQr ? (
            <ChevronUp size={18} color={colors.textMuted} />
          ) : (
            <ChevronDown size={18} color={colors.textMuted} />
          )}
        </Pressable>
        {showQr ? (
          <View className="items-center">
            {/* White behind the code whatever the theme — scanners need the contrast. */}
            <View className="rounded-2xl bg-white p-3">
              <Image
                source={{ uri: setup.qrCodeDataUrl }}
                style={{ width: 200, height: 200 }}
                accessibilityLabel="QR code for your authenticator app"
              />
            </View>
          </View>
        ) : null}
      </View>

      <View className="gap-4">
        <StepHeading
          step="Step 3 of 3"
          title="Enter the code it shows"
          body="Two-factor turns on only once this code checks out."
        />
        <OtpInput
          ref={codeRef}
          value={code}
          onChangeText={(value) => {
            setError(null);
            setCode(value);
          }}
          onComplete={submit}
          error={Boolean(error)}
          editable={!confirm.isPending}
        />
        {error ? <Banner tone="error" message={error} /> : null}
        <Text
          className="text-center text-xs text-ink-faint dark:text-ink-dark-faint"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          This setup expires in {Math.floor(secondsLeft / 60)}:
          {String(secondsLeft % 60).padStart(2, '0')}
        </Text>
        <View className="gap-2">
          <Button
            label="Turn on two-factor"
            size="lg"
            fullWidth
            loading={confirm.isPending}
            disabled={code.length !== 6}
            onPress={() => submit()}
          />
          <Button label="Cancel" variant="ghost" size="lg" fullWidth onPress={onCancel} />
        </View>
      </View>
    </View>
  );
}

/* ── Turn off / replace codes: password + a current code ─────────────────────────────── */

function ProtectedStep({
  purpose,
  onCancel,
  onDone,
}: {
  purpose: 'disable' | 'recovery';
  onCancel: () => void;
  onDone: (codes: string[] | null) => void;
}) {
  const disable = useDisableMfa();
  const regenerate = useRegenerateRecoveryCodes();
  const busy = disable.isPending || regenerate.isPending;
  const codeRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ready = password.length > 0 && code.replace(/-/g, '').length >= 6;

  const submit = () => {
    if (!ready || busy) return;
    setError(null);
    const body = { currentPassword: password, code };
    const onError = (err: unknown) =>
      setError(getErrorMessage(err, 'Couldn’t update two-factor authentication.'));
    if (purpose === 'disable') {
      disable.mutate(body, {
        onSuccess: () => {
          toast.success('Two-factor is off');
          onDone(null);
        },
        onError,
      });
    } else {
      regenerate.mutate(body, { onSuccess: ({ recoveryCodes }) => onDone(recoveryCodes), onError });
    }
  };

  return (
    <View className="gap-5">
      <StepHeading
        step={purpose === 'disable' ? 'Turn off' : 'Replace codes'}
        title={purpose === 'disable' ? 'Turn off two-factor?' : 'Replace your recovery codes'}
        body={
          purpose === 'disable'
            ? 'Sign-in will ask only for your password again, and your other devices will be signed out.'
            : 'Every current recovery code stops working the moment new ones are made.'
        }
      />
      <Input
        label="Current password"
        value={password}
        onChangeText={(text) => {
          setError(null);
          setPassword(text);
        }}
        secureToggle
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => codeRef.current?.focus()}
      />
      <Input
        ref={codeRef}
        label="Authenticator or recovery code"
        placeholder="123456 or XXXX-XXXX-XXXX"
        value={code}
        onChangeText={(text) => {
          setError(null);
          setCode(normaliseMfaCode(text, 'recovery'));
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {error ? <Banner tone="error" message={error} /> : null}
      <View className="gap-2">
        <Button
          label={purpose === 'disable' ? 'Turn off two-factor' : 'Make new codes'}
          variant={purpose === 'disable' ? 'danger' : 'primary'}
          size="lg"
          fullWidth
          loading={busy}
          disabled={!ready}
          onPress={submit}
        />
        <Button label="Cancel" variant="ghost" size="lg" fullWidth onPress={onCancel} />
      </View>
    </View>
  );
}

/* ── Recovery codes, shown once ──────────────────────────────────────────────────────── */

function RecoveryCodes({
  codes,
  fresh,
  onDone,
}: {
  codes: string[];
  fresh: boolean;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const profile = useAccountProfile();
  const authEmail = useAuthStore((state) => state.user?.email);
  const [shared, setShared] = useState(false);
  const email = profile.data?.email ?? authEmail ?? '';

  const share = async () => {
    try {
      const result = await Share.share({
        message: recoveryCodesText(appConfig.name, email, codes),
        title: `${appConfig.name} recovery codes`,
      });
      if (result.action === Share.sharedAction) setShared(true);
    } catch {
      toast.error('Couldn’t open sharing', 'Write the codes down instead.');
    }
  };

  return (
    <View className="gap-5">
      <View className="items-center gap-3">
        <IconTile Icon={KeyRound} tone="amber" size="lg" />
        <Text className="text-center text-lg font-bold text-ink dark:text-ink-dark">
          {fresh ? 'Two-factor is on — save these codes' : 'Your new recovery codes'}
        </Text>
        <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          If you lose this phone, each code gets you in once. Keep them somewhere other than this
          phone — they can’t be shown again.
        </Text>
      </View>

      <View className="flex-row flex-wrap rounded-card border border-line bg-surface p-2 dark:border-line-dark dark:bg-surface-dark">
        {codes.map((code) => (
          <View key={code} className="w-1/2 items-center py-2.5">
            <Text
              selectable
              className="text-[15px] font-semibold text-ink dark:text-ink-dark"
              style={MONO}
            >
              {code}
            </Text>
          </View>
        ))}
      </View>

      <View className="gap-2">
        <Button
          label={shared ? 'Saved — share again' : 'Save or share codes'}
          variant="secondary"
          size="lg"
          fullWidth
          leftIcon={<Share2 size={18} color={colors.link} />}
          onPress={() => void share()}
        />
        <Button label="I’ve saved them" size="lg" fullWidth onPress={onDone} />
      </View>
    </View>
  );
}

function StepHeading({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <View className="gap-1">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-brand-text dark:text-brand-text-dark">
        {step}
      </Text>
      <Text
        className="text-lg font-bold text-ink dark:text-ink-dark"
        style={{ letterSpacing: -0.3 }}
      >
        {title}
      </Text>
      <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        {body}
      </Text>
    </View>
  );
}
