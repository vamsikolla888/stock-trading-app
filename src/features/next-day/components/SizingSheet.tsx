import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ModalSheet } from '@/features/home/components/ModalSheet';
import { formatINR, formatNumber } from '@/lib/utils/formatters';

import { parseCapital, parseRisk, SIZING_LIMITS, type SizingPrefs } from '../lib/view';
import { useNextDaySizing } from '../store';
import { NUM } from './parts';

/**
 * The capital and risk per trade every candidate is sized for. Kept on this device only and
 * never sent. Empty fields keep the value in force; "Use the report's" forgets the reader's own.
 */
export function SizingSheet({
  visible,
  current,
  reportDefault,
  onClose,
}: {
  visible: boolean;
  current: SizingPrefs;
  reportDefault: SizingPrefs;
  onClose: () => void;
}) {
  const own = useNextDaySizing((state) => state.prefs);
  const setPrefs = useNextDaySizing((state) => state.setPrefs);
  const [capitalText, setCapitalText] = useState('');
  const [riskText, setRiskText] = useState('');
  const capital = capitalText.trim() ? parseCapital(capitalText) : current.capital;
  const risk = riskText.trim() ? parseRisk(riskText) : current.riskPct;
  const valid = capital !== null && risk !== null;

  const close = () => {
    setCapitalText('');
    setRiskText('');
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      title="Size for your capital"
      onClose={close}
      footer={
        <View className="gap-2">
          <Button
            label="Save"
            fullWidth
            disabled={!valid}
            onPress={() => {
              if (capital === null || risk === null) return;
              setPrefs({ capital, riskPct: risk });
              close();
            }}
          />
          {own ? (
            <Button
              label="Use the report’s"
              variant="ghost"
              fullWidth
              onPress={() => {
                setPrefs(null);
                close();
              }}
            />
          ) : null}
        </View>
      }
    >
      <Text className="mb-4 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
        Shares come from the stop distance, never the score. Stays on this device.
      </Text>
      <Input
        label="Capital (₹)"
        keyboardType="number-pad"
        placeholder={formatNumber(current.capital, 0)}
        value={capitalText}
        onChangeText={setCapitalText}
        error={
          capitalText.trim() && capital === null
            ? `Between ${formatINR(SIZING_LIMITS.minCapital, 0)} and ₹10 crore.`
            : undefined
        }
      />
      <View className="h-3" />
      <Input
        label="Risk per trade (%)"
        keyboardType="decimal-pad"
        placeholder={String(current.riskPct)}
        value={riskText}
        onChangeText={setRiskText}
        error={
          riskText.trim() && risk === null
            ? `Between ${SIZING_LIMITS.minRisk}% and ${SIZING_LIMITS.maxRisk}%.`
            : undefined
        }
      />
      <Text className="mt-3 text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
        {valid
          ? `Risk a trade = ${formatINR(Math.round((capital * risk) / 100), 0)} · the system’s rule is 0.25–0.5%`
          : 'The system’s rule is 0.25–0.5% a trade'}
      </Text>
      <Text className="mt-1 text-xs text-ink-faint dark:text-ink-dark-faint" style={NUM}>
        {`Report default: ${formatINR(reportDefault.capital, 0)} at ${reportDefault.riskPct}%`}
      </Text>
    </ModalSheet>
  );
}
