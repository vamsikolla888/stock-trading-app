import type { ExpoConfig, ConfigContext } from 'expo/config';

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const isProd = APP_ENV === 'production';
const isDevelopment = APP_ENV === 'development';

const BRAND_GREEN = '#00b386';
const SPLASH_LIGHT = '#ffffff';
const SPLASH_DARK = '#111417';

/**
 * Fail the build — not the app at runtime — when a release profile would ship without
 * a real API. The runtime fallback in src/config/env.ts is localhost, which only makes
 * sense on a developer machine.
 */
function assertReleaseApiUrl(): void {
  if (isDevelopment) return;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  if (!/^https:\/\/[^/]+/.test(apiUrl) || /localhost|127\.0\.0\.1/.test(apiUrl)) {
    throw new Error(
      `[app.config] EXPO_PUBLIC_API_URL must be a public https URL for "${APP_ENV}" builds ` +
        `(got "${apiUrl || '<unset>'}"). Set it for this profile with \`eas env:create\` or in eas.json.`,
    );
  }
}

assertReleaseApiUrl();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'The Ledger' : `The Ledger (${APP_ENV})`,
  slug: 'stock-trading-app',
  version: '1.0.0',
  orientation: 'default',
  icon: './src/assets/images/icon.png',
  scheme: 'stocktrading',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: isProd
      ? 'com.vamsikrishnakolla.stocktrading'
      : 'com.vamsikrishnakolla.stocktrading.dev',
    infoPlist: {
      NSFaceIDUsageDescription:
        'We use Face ID to let you securely and quickly sign in to your account.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './src/assets/images/adaptive-icon.png',
      backgroundImage: './src/assets/images/adaptive-icon-background.png',
      monochromeImage: './src/assets/images/adaptive-icon-monochrome.png',
      backgroundColor: BRAND_GREEN,
    },
    package: isProd
      ? 'com.vamsikrishnakolla.stocktrading'
      : 'com.vamsikrishnakolla.stocktrading.dev',
    permissions: ['USE_BIOMETRIC', 'USE_FINGERPRINT'],
    // Keep app data out of Google Drive auto-backup. The MMKV file is encrypted with a
    // Keystore key that never leaves the device, so a restored copy would be unreadable
    // anyway — and financial app data has no business in a cloud backup.
    allowBackup: false,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './src/assets/images/favicon.png',
  },
  plugins: [
    ['expo-router', { root: './src/app' }],
    'expo-secure-store',
    'expo-local-authentication',
    [
      'expo-splash-screen',
      {
        image: './src/assets/images/splash.png',
        imageWidth: 96,
        resizeMode: 'contain',
        backgroundColor: SPLASH_LIGHT,
        dark: {
          image: './src/assets/images/splash.png',
          backgroundColor: SPLASH_DARK,
        },
      },
    ],
    [
      'expo-notifications',
      {
        icon: './src/assets/images/notification-icon.png',
        color: BRAND_GREEN,
      },
    ],
    'expo-system-ui',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: '74b4bb0b-3444-4ac8-850d-f82c331d35ab',
    },
  },
  owner: 'vamsikrishnakolla2001',
});
