import React, { memo, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

type LogoSize = 'sm' | 'md' | 'lg';

const sizes: Record<LogoSize, { px: number; radius: number; text: string }> = {
  sm: { px: 31, radius: 9, text: 'text-[10px]' },
  md: { px: 36, radius: 11, text: 'text-[11px]' },
  lg: { px: 42, radius: 13, text: 'text-sm' },
};

interface StockLogoProps {
  symbol: string;
  uri?: string | null;
  size?: LogoSize;
}

/**
 * Company logo tile. Falls back to the symbol's initial — both when there's no logo URL
 * and when the image fails to load — so a missing logo never leaves an empty box.
 */
export const StockLogo = memo(function StockLogo({ symbol, uri, size = 'md' }: StockLogoProps) {
  // Remember which URL failed, not just that one did: a recycled row given a new symbol
  // must try its own logo.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const { px, radius, text } = sizes[size];
  const showImage = Boolean(uri) && failedUri !== uri;

  return (
    <View
      accessible={false}
      className="items-center justify-center overflow-hidden border border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
      style={{ width: px, height: px, borderRadius: radius }}
    >
      {showImage ? (
        <Image
          source={{ uri: uri ?? undefined }}
          style={{ width: px - 8, height: px - 8 }}
          resizeMode="contain"
          onError={() => setFailedUri(uri ?? null)}
        />
      ) : (
        <Text className={cn('font-extrabold text-ink-muted dark:text-ink-dark-muted', text)}>
          {symbol.charAt(0).toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );
});
