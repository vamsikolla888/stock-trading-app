import React from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/utils/cn';

interface CardProps extends ViewProps {
  padded?: boolean;
}

export function Card({ padded = true, className, children, ...rest }: CardProps) {
  return (
    <View
      className={cn(
        'rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
        padded && 'p-4',
        className,
      )}
      {...rest}
    >
      {children}
    </View>
  );
}
