import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { Input } from '@/components/ui/Input';

import { parseNumericText, sanitizeNumericText } from '../lib/numericText';

interface NumberFieldProps {
  label: string;
  /** undefined = empty ("not set"); NaN = text that is not a number yet. */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  integer?: boolean;
  allowNegative?: boolean;
  error?: string;
  helperText?: string;
  containerClassName?: string;
  accessibilityLabel?: string;
}

/**
 * A numeric input that keeps the user's text while they type ("1." stays "1.") and reports
 * a number — or undefined when cleared, because an empty box means "off", never zero (a 0%
 * stop would exit every trade instantly).
 */
export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  integer = false,
  allowNegative = false,
  error,
  helperText,
  containerClassName,
  accessibilityLabel,
}: NumberFieldProps) {
  const [text, setText] = useState(() => toText(value));
  const lastEmitted = useRef<number | undefined>(value);

  // Resync only when the value changes from outside (a template applied), not on our own edit.
  useEffect(() => {
    if (!Object.is(value, lastEmitted.current)) {
      lastEmitted.current = value;
      setText(toText(value));
    }
  }, [value]);

  const keyboardType = allowNegative
    ? Platform.OS === 'ios'
      ? 'numbers-and-punctuation'
      : 'numeric'
    : integer
      ? 'number-pad'
      : 'decimal-pad';

  return (
    <Input
      label={label}
      value={text}
      placeholder={placeholder}
      keyboardType={keyboardType}
      returnKeyType="done"
      error={error}
      helperText={helperText}
      containerClassName={containerClassName}
      accessibilityLabel={accessibilityLabel ?? label}
      style={{ fontVariant: ['tabular-nums'] }}
      onChangeText={(raw) => {
        const cleaned = sanitizeNumericText(raw, { integer, allowNegative });
        setText(cleaned);
        const parsed = parseNumericText(cleaned);
        lastEmitted.current = parsed;
        onChange(parsed);
      }}
    />
  );
}

function toText(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
