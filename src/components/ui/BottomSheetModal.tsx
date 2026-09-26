import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import React, { forwardRef, useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

interface AppBottomSheetProps {
  children: React.ReactNode;
  snapPoints?: (string | number)[];
  onDismiss?: () => void;
}

export type AppBottomSheetRef = BottomSheet;

/** Thin wrapper around @gorhom/bottom-sheet with theme-aware backdrop/handle, used for all app modals/sheets. */
export const AppBottomSheet = forwardRef<BottomSheet, AppBottomSheetProps>(
  ({ children, snapPoints, onDismiss }, ref) => {
    const { colors } = useTheme();
    const points = useMemo(() => snapPoints ?? ['50%', '90%'], [snapPoints]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
      ),
      [],
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={points}
        enablePanDownToClose
        onClose={onDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView style={{ flex: 1 }}>
          <View className="px-4 pb-4">{children}</View>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

AppBottomSheet.displayName = 'AppBottomSheet';
