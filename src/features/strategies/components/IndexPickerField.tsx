import React, { useMemo, useState } from 'react';

import { useIndexCatalog } from '../hooks';
import type { IndexSummary } from '../types';

import { ChoiceSheet, SelectField, type Choice } from './ChoiceSheet';

const NONE = '__all__';

/** Broad indices by size ladder (Nifty 50 first), then sectoral/thematic alphabetically. */
export function indexChoices(indices: readonly IndexSummary[]): Choice<string>[] {
  const broad = indices
    .filter((i) => i.category === 'broad')
    .sort(
      (a, b) =>
        (a.broadRank ?? Number.MAX_SAFE_INTEGER) - (b.broadRank ?? Number.MAX_SAFE_INTEGER) ||
        a.label.localeCompare(b.label),
    );
  const others = indices
    .filter((i) => i.category !== 'broad')
    .sort((a, b) => a.label.localeCompare(b.label));
  const toChoice =
    (section: string) =>
    (index: IndexSummary): Choice<string> => ({
      key: index.key,
      label: index.label,
      section,
      disabled: index.unavailable,
      description: index.unavailable
        ? (index.caveat ?? 'Membership unavailable')
        : `${index.constituentCount} stocks`,
    });
  return [
    { key: NONE, label: 'Whole exchange', description: 'No index filter' },
    ...broad.map(toChoice('Broad market')),
    ...others.map(toChoice('Sectoral & thematic')),
  ];
}

/**
 * "Scan only this index". Indices whose membership could not be imported are shown but
 * disabled — scanning an unknown universe would look exactly like a rule matching nothing.
 */
export function IndexPickerField({
  value,
  onChange,
  footnote,
}: {
  value: string | null;
  onChange: (indexKey: string | null) => void;
  footnote?: string;
}) {
  const [open, setOpen] = useState(false);
  const catalog = useIndexCatalog();
  const indices = useMemo(() => catalog.data ?? [], [catalog.data]);
  const choices = useMemo(() => indexChoices(indices), [indices]);
  const selected = value ? indices.find((i) => i.key === value) : null;
  const label = value ? (selected?.label ?? value) : 'Whole exchange';

  return (
    <>
      <SelectField
        label="Index"
        value={label}
        onPress={() => setOpen(true)}
        disabled={catalog.isPending && !value}
        helperText={
          catalog.error
            ? "Couldn't load the index list — the whole exchange is scanned."
            : undefined
        }
      />
      <ChoiceSheet
        visible={open}
        title="Scan only this index"
        choices={choices}
        value={value ?? NONE}
        onSelect={(key) => onChange(key === NONE ? null : key)}
        onClose={() => setOpen(false)}
        footnote={footnote}
      />
    </>
  );
}
