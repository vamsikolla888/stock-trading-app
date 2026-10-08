import Eye from 'lucide-react-native/icons/eye';
import Mail from 'lucide-react-native/icons/mail';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View, type TextInput } from 'react-native';

import { StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Section } from '@/components/ui/Section';
import { adminApi } from '@/features/admin/api';
import type { RevealCodeSent, RevealResult } from '@/features/admin/types';
import { formatIstDateTime } from '@/features/home/lib/istTime';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

type Phase = 'idle' | 'sent' | 'revealed';

const MONO = {
  fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  fontVariant: ['tabular-nums' as const],
};

/** "4:07" — a countdown. */
function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Admin › Groww access token (web: the admin console tab). Shows the signed-in admin's OWN Groww
 * access token after a single-use code emailed to their own address — for calling Groww's API
 * directly. Read-only on the server: viewing never mints or refreshes the token the platform uses.
 *
 * The token lives only in this screen's state — deliberately not the query cache, which is
 * persisted to the device — and is dropped after the server's visible window, when the app goes
 * to the background, or when the screen closes. Seeing it again takes a new code.
 */
export function GrowwTokenPanel() {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [sent, setSent] = useState<RevealCodeSent | null>(null);
  const [result, setResult] = useState<RevealResult | null>(null);
  const [hideAt, setHideAt] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<TextInput>(null);

  const hide = useCallback(() => {
    setResult(null);
    setHideAt(null);
    setSent(null);
    setCode('');
    setPhase('idle');
  }, []);

  // A one-second clock only while something is counting down.
  useEffect(() => {
    if (phase === 'idle') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Auto-hide: drop the token from memory, not just from view.
  useEffect(() => {
    if (phase !== 'revealed' || hideAt == null) return undefined;
    const timer = setTimeout(hide, Math.max(0, hideAt - Date.now()));
    return () => clearTimeout(timer);
  }, [phase, hideAt, hide]);

  // Leaving the app (the app switcher's snapshot, another app) clears it too.
  useEffect(() => {
    if (phase !== 'revealed') return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') hide();
    });
    return () => subscription.remove();
  }, [phase, hide]);

  const codeExpired = phase === 'sent' && sent != null && now >= new Date(sent.expiresAt).getTime();

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await adminApi.requestGrowwTokenCode();
      setSent(next);
      setCode('');
      setPhase('sent');
      setNow(Date.now());
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(getErrorMessage(err, 'The code could not be sent.'));
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await adminApi.revealGrowwToken(code);
      const shownAt = Date.now();
      setResult(next);
      setNow(shownAt);
      setHideAt(shownAt + Math.max(10, next.visibleForSeconds) * 1000);
      setCode('');
      setPhase('revealed');
    } catch (err) {
      setError(getErrorMessage(err, 'The code was not accepted.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StackScreen title="Groww access token" subtitle="Your own connection only">
      <Card className="gap-2.5">
        <View className="flex-row gap-2.5">
          <ShieldCheck size={16} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
            Read-only — viewing never mints or refreshes the token the platform uses.
          </Text>
        </View>
        <View className="flex-row gap-2.5">
          <Mail size={16} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
            Each view needs a new emailed code (valid 5 minutes, single use), and you get an email
            after every view.
          </Text>
        </View>
      </Card>

      {phase === 'idle' ? (
        <Section title="Get a code">
          <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            A one-time code goes to the email address on your account. Enter it here to see the
            token.
          </Text>
          <Button
            className="mt-3"
            label={busy ? 'Sending…' : 'Email me a code'}
            loading={busy}
            leftIcon={<Mail size={16} color="#ffffff" />}
            onPress={() => void sendCode()}
          />
        </Section>
      ) : null}

      {phase === 'sent' && sent ? (
        <Section title="Enter the code">
          <Text
            accessibilityLiveRegion="polite"
            className="text-[13px] leading-[19px] text-ink dark:text-ink-dark"
          >
            Sent to <Text className="font-semibold">{sent.sentTo}</Text>.{' '}
            {codeExpired ? (
              <Text className="font-semibold text-danger-600 dark:text-danger-dark">
                This code has expired.
              </Text>
            ) : (
              <>
                Expires in{' '}
                <Text className="font-semibold" style={MONO}>
                  {mmss(new Date(sent.expiresAt).getTime() - now)}
                </Text>
                .
              </>
            )}
          </Text>
          <Input
            ref={codeRef}
            containerClassName="mt-3"
            label="6-digit code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            editable={!busy && !codeExpired}
            onSubmitEditing={() => void reveal()}
          />
          <Button
            className="mt-3"
            label={busy ? 'Checking…' : 'Show token'}
            loading={busy}
            disabled={codeExpired || code.length !== 6}
            leftIcon={<Eye size={16} color="#ffffff" />}
            onPress={() => void reveal()}
          />
          <Button
            className="mt-2"
            label="Send a new code"
            variant="ghost"
            disabled={busy}
            onPress={() => void sendCode()}
          />
          <Text className="mt-1 text-center text-xs text-ink-faint dark:text-ink-dark-faint">
            {sent.codesLeft} more code{sent.codesLeft === 1 ? '' : 's'} can be requested in this
            15-minute window.
          </Text>
        </Section>
      ) : null}

      {error ? <Banner className="mt-4" tone="error" message={error} /> : null}

      {phase === 'revealed' && result ? (
        <Section
          title="Your token"
          right={<Button label="Hide now" variant="outline" size="sm" onPress={hide} />}
        >
          <Text
            accessibilityLiveRegion="polite"
            className="mb-3 text-xs text-ink-muted dark:text-ink-dark-muted"
          >
            Shown {formatIstDateTime(result.revealedAt)} IST · hides in{' '}
            <Text className="font-semibold text-ink dark:text-ink-dark" style={MONO}>
              {mmss((hideAt ?? now) - now)}
            </Text>
          </Text>
          {result.connections.length === 0 ? (
            <Banner
              tone="info"
              message="You have no Groww connection. Connect Groww under Broker connections to get one."
            />
          ) : (
            <View className="gap-3">
              {result.connections.map((c) => (
                <Card key={c.connectionId} className="gap-3">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                      Groww{c.accountLabel ? ` · ${c.accountLabel}` : ''}
                    </Text>
                    <Badge
                      label={c.status}
                      variant={c.status === 'connected' ? 'success' : 'neutral'}
                    />
                    <Badge
                      label={
                        c.expired
                          ? 'Expired'
                          : c.minutesLeft != null
                            ? `${Math.floor(c.minutesLeft / 60)} h ${c.minutesLeft % 60} min left`
                            : 'Expiry unknown'
                      }
                      variant={c.expired ? 'danger' : 'primary'}
                    />
                  </View>
                  {c.token ? (
                    <View className="rounded-field bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
                      <Text
                        selectable
                        accessibilityLabel="Access token"
                        className="text-xs leading-[18px] text-ink dark:text-ink-dark"
                        style={MONO}
                      >
                        {c.token}
                      </Text>
                      <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                        Press and hold to select and copy.
                      </Text>
                    </View>
                  ) : null}
                  <View>
                    {c.issuedAt ? (
                      <KeyValueRow label="Issued" value={`${formatIstDateTime(c.issuedAt)} IST`} />
                    ) : null}
                    {c.expiresAt ? (
                      <KeyValueRow
                        divider={Boolean(c.issuedAt)}
                        label="Expires"
                        value={`${formatIstDateTime(c.expiresAt)} IST`}
                      />
                    ) : null}
                  </View>
                  <Text className="text-[11px] leading-4 text-ink-muted dark:text-ink-dark-muted">
                    Use with the headers{' '}
                    <Text style={MONO}>Authorization: Bearer &lt;token&gt;</Text> and{' '}
                    <Text style={MONO}>X-API-VERSION: 1.0</Text>.
                  </Text>
                  {c.note ? (
                    <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                      {c.note}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </View>
          )}
          <Banner
            className="mt-4"
            tone="warning"
            message="Treat this like a password: it can place orders on your Groww account until it expires. Anything you paste it into keeps it."
          />
        </Section>
      ) : null}
    </StackScreen>
  );
}
