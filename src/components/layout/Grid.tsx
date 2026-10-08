import React, { useCallback, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { cn } from '@/lib/utils/cn';

/**
 * A grid of equal columns that measures itself, so it works full-width, inside a card or beside
 * another panel alike. A child may span several columns with `<GridItem span={2}>`; a span wider
 * than the grid takes the whole row (two-column content on a one-column phone).
 */

interface GridItemProps {
  span?: number;
  children: React.ReactNode;
}

export function GridItem({ children }: GridItemProps) {
  return <>{children}</>;
}

/** Tiles in one row share its height: the cell stretches, and the tile fills the cell. */
function fillHeight(node: React.ReactNode): React.ReactNode {
  if (!React.isValidElement<{ className?: string }>(node)) return node;
  return React.cloneElement(node, { className: cn(node.props.className, 'flex-1') });
}

export function Grid({
  columns,
  gap = 12,
  equalHeight = true,
  children,
  className,
}: {
  columns: number;
  gap?: number;
  /** Tiles in a row share its height (default). Off for lists of different lengths. */
  equalHeight?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const cols = Math.max(1, columns);
  const unit = width > 0 ? (width - gap * (cols - 1)) / cols : 0;
  const items = React.Children.toArray(children).filter(React.isValidElement);

  return (
    <View
      onLayout={onLayout}
      className={cn('flex-row flex-wrap', !equalHeight && 'items-start', className)}
      style={{ columnGap: gap, rowGap: gap }}
    >
      {items.map((child, index) => {
        const span =
          child.type === GridItem
            ? Math.min(cols, Math.max(1, (child.props as GridItemProps).span ?? 1))
            : 1;
        const style =
          width > 0
            ? { width: unit * span + gap * (span - 1) }
            : // Before the first measure: a close estimate, so nothing jumps on mount.
              { width: `${(span / cols) * 100 - 2}%` as const };
        return (
          <View key={child.key ?? index} style={style}>
            {(() => {
              const content =
                child.type === GridItem ? (child.props as GridItemProps).children : child;
              return equalHeight ? fillHeight(content) : content;
            })()}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Two independent stacks side by side on a wide window, one stack on a phone. For pages of
 * uneven groups (settings), where a grid's equal row heights would leave holes.
 */
export function SplitColumns({
  split,
  left,
  right,
  gap = 24,
}: {
  split: boolean;
  left: React.ReactNode;
  right: React.ReactNode;
  gap?: number;
}) {
  if (!split) {
    return (
      <View>
        {left}
        {right}
      </View>
    );
  }
  return (
    <View className="flex-row items-start" style={{ columnGap: gap }}>
      <View className="flex-1">{left}</View>
      <View className="flex-1">{right}</View>
    </View>
  );
}
