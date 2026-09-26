import Pencil from 'lucide-react-native/icons/pencil';
import Share2 from 'lucide-react-native/icons/share-2';
import Trash from 'lucide-react-native/icons/trash';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Note, Sheet } from '@/features/trading/components/Sheet';
import { getErrorMessage } from '@/types/api';

const MAX_NAME = 60;

/**
 * Names a list — creating one or renaming one. Mount it fresh for each use (the parent
 * renders it only while open), so the draft always starts from the list's current name.
 */
export function ListNameSheet({
  mode,
  initialName = '',
  busy,
  error,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'rename';
  initialName?: string;
  busy: boolean;
  error: unknown;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const unchanged = mode === 'rename' && trimmed === initialName.trim();
  const submit = () => {
    if (!trimmed || unchanged || busy) return;
    onSubmit(trimmed);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      busy={busy}
      title={mode === 'create' ? 'New watchlist' : 'Rename watchlist'}
      subtitle={
        mode === 'create'
          ? 'Each stock is tracked from the price it had when you added it.'
          : undefined
      }
      footer={
        <Button
          label={mode === 'create' ? 'Create list' : 'Save name'}
          size="lg"
          fullWidth
          disabled={!trimmed || unchanged}
          loading={busy}
          onPress={submit}
        />
      }
    >
      <Input
        label="List name"
        value={name}
        onChangeText={setName}
        maxLength={MAX_NAME}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        placeholder="e.g. Banks to watch"
        helperText={`${trimmed.length}/${MAX_NAME}`}
      />
      {error ? <Banner className="mt-3" tone="error" message={getErrorMessage(error)} /> : null}
    </Sheet>
  );
}

/** A list's actions: rename and delete on the user's own lists, share on every list. */
export function ListActionsSheet({
  name,
  readOnly,
  canShare,
  onRename,
  onShare,
  onDelete,
  onClose,
}: {
  name: string;
  readOnly: boolean;
  canShare: boolean;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible
      onClose={onClose}
      title={name}
      subtitle={readOnly ? 'Updated automatically' : 'Your list'}
    >
      <ListCard>
        {canShare ? (
          <MenuRow
            Icon={Share2}
            iconTone="blue"
            title="Share as CSV"
            subtitle="Symbols, prices and moves, in the order shown"
            onPress={onShare}
          />
        ) : null}
        {!readOnly ? (
          <>
            {canShare ? <RowDivider /> : null}
            <MenuRow Icon={Pencil} iconTone="slate" title="Rename" onPress={onRename} />
            <RowDivider />
            <MenuRow
              Icon={Trash}
              tone="danger"
              title="Delete list"
              subtitle="The stocks stay on your other lists"
              onPress={onDelete}
            />
          </>
        ) : null}
      </ListCard>
      {readOnly ? (
        <View className="mt-1">
          <Note>
            This list fills itself from the daily AI recommendations — it can't be renamed, deleted
            or edited by hand.
          </Note>
        </View>
      ) : null}
    </Sheet>
  );
}
