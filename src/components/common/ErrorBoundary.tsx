import * as SplashScreen from 'expo-splash-screen';
import React from 'react';

import { ErrorScreen } from '@/components/common/ErrorScreen';

interface Props {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // A crash on the very first render would otherwise stay hidden behind the native
    // splash, which only the (now unmounted) app knows to dismiss.
    void SplashScreen.hideAsync().catch(() => undefined);
    // Wire to a crash-reporting service (Sentry, Bugsnag) in production.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = (): void => this.setState({ error: null });

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    // ErrorScreen reads the scheme from NativeWind, not ThemeProvider: this renders above
    // the providers and must work even when the failure came from theming itself.
    return (
      <ErrorScreen
        fullScreen
        message="The app hit an unexpected problem. Your account, holdings and orders are not affected. Try again, or restart the app if this keeps happening."
        error={error}
        onRetry={this.reset}
      />
    );
  }
}
