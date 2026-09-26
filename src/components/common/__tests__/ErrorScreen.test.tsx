import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ErrorScreen } from '@/components/common/ErrorScreen';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));

describe('ErrorScreen', () => {
  it('offers retry and home when both are wired', () => {
    const onRetry = jest.fn();
    const onHome = jest.fn();
    render(<ErrorScreen onRetry={onRetry} onHome={onHome} />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.press(screen.getByRole('button', { name: 'Go to home' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('shows the raw error only in development builds', () => {
    render(<ErrorScreen error={new Error('boom: internal detail')} />);
    // Jest runs with __DEV__ true.
    expect(screen.getByText('boom: internal detail')).toBeTruthy();
  });
});

describe('ErrorBoundary', () => {
  function Bomb({ explode }: { explode: boolean }) {
    if (explode) throw new Error('render failed');
    return <Text>All good</Text>;
  }

  it('replaces a crashed tree with the error page, and recovers on retry', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let explode = true;
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb explode={explode} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    explode = false;
    rerender(
      <ErrorBoundary>
        <Bomb explode={explode} />
      </ErrorBoundary>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('All good')).toBeTruthy();
    consoleError.mockRestore();
  });
});
