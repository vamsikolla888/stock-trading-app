import Constants from 'expo-constants';
import { Platform } from 'react-native';

type AppEnvName = 'development' | 'preview' | 'production';

interface AppEnv {
  apiUrl: string;
  /** API host without the /api/v1 prefix — static routes (stock logos) live here. */
  serverOrigin: string;
  /** Socket.IO origin (http/https — Socket.IO negotiates the WebSocket itself). */
  socketUrl: string;
  appEnv: AppEnvName;
  enableBiometrics: boolean;
  sentryDsn: string | undefined;
}

const LOOPBACK_URL = /^([a-z]+:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/i;
const ANDROID_EMULATOR_HOST = '10.0.2.2';

/**
 * The host Metro is being served from, e.g. "192.168.1.20" — reachable from the iOS
 * simulator, the Android emulator and any physical device on the same network.
 */
function getMetroHost(): string | undefined {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  return hostUri?.split(':')[0] || undefined;
}

/**
 * `localhost` inside a simulator/emulator/device is the device itself, not the dev
 * machine running the API. In development only, rewrite a loopback host to the Metro
 * host so a single `.env` works on every target. Release builds are never rewritten.
 */
export function resolveDevUrl(
  url: string,
  { isDev, platform, metroHost }: { isDev: boolean; platform: string; metroHost?: string },
): string {
  if (!isDev || platform === 'web' || !LOOPBACK_URL.test(url)) return url;

  const host = metroHost ?? (platform === 'android' ? ANDROID_EMULATOR_HOST : undefined);
  return host ? url.replace(LOOPBACK_URL, `$1${host}`) : url;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function resolve(url: string): string {
  return stripTrailingSlash(
    resolveDevUrl(url, { isDev: __DEV__, platform: Platform.OS, metroHost: getMetroHost() }),
  );
}

// Expo statically replaces `process.env.EXPO_PUBLIC_*` at build time — each
// reference must be written out literally (no dynamic `process.env[name]`
// lookups) or it won't be inlined into the production bundle. The fallbacks are
// only reachable in development: app.config.ts fails a production build that
// doesn't set a real https API URL.
const apiUrl = resolve(process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1');
const serverOrigin = apiUrl.replace(/\/api\/v\d+$/, '');

export const env: AppEnv = {
  apiUrl,
  serverOrigin,
  // Socket.IO shares the API's HTTP server. An explicit ws(s):// value is accepted and
  // mapped to http(s):// — Socket.IO wants the HTTP origin and upgrades on its own.
  socketUrl: process.env.EXPO_PUBLIC_WS_URL
    ? resolve(process.env.EXPO_PUBLIC_WS_URL).replace(/^ws(s?):\/\//, 'http$1://')
    : serverOrigin,
  appEnv: (process.env.EXPO_PUBLIC_APP_ENV || 'development') as AppEnvName,
  enableBiometrics: (process.env.EXPO_PUBLIC_ENABLE_BIOMETRICS ?? 'true') === 'true',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || undefined,
};

export const isDev = env.appEnv === 'development';
export const isProd = env.appEnv === 'production';

export const appVersion = Constants.expoConfig?.version ?? '0.0.0';
