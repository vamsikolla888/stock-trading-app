declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_API_URL: string | undefined;
    readonly EXPO_PUBLIC_WS_URL: string | undefined;
    readonly EXPO_PUBLIC_APP_ENV: 'development' | 'preview' | 'production' | undefined;
    readonly EXPO_PUBLIC_ENABLE_BIOMETRICS: string | undefined;
    readonly EXPO_PUBLIC_SENTRY_DSN: string | undefined;
  }
}
